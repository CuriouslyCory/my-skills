import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@curiouslycory/db";
import type { Database } from "@curiouslycory/db";
import { publishTargets, skills } from "@curiouslycory/db/schema";

import type { GithubClientDeps } from "../lib/github-connector";
import {
  getAuthenticatedGithubClient,
  GithubConnectorError,
} from "../lib/github-connector";
import type {
  ArtifactState,
  PublishArtifact,
  PublishOctokit,
} from "../lib/publish";
import {
  buildCommitMessage,
  computeArtifactState,
  diffPublish,
  hashContent,
  renderArtifactSkill,
  renderArtifacts,
  publishTree,
} from "../lib/publish";
import { protectedProcedure } from "../trpc";

/**
 * Publish router (#29).
 *
 * Lets a user publish their personal library as a public (or private) GitHub repo
 * in the agentskills.io layout, entirely server-side via the #28 authenticated
 * octokit and the Git Data API (no filesystem). `configure` stores the target and
 * selection; `run` renders + commits idempotently; `status` reports the last
 * publish and per-artifact state. All procedures are `protectedProcedure` and
 * scoped to `ctx.session.user.id` (#21).
 */

const VisibilitySchema = z.enum(["public", "private"]);

/**
 * Maps a connector error to a distinct, actionable tRPC error (mirrors the github
 * router): missing connection/scope is FORBIDDEN (connect/grant), a revoked token
 * is UNAUTHORIZED (reconnect). Anything else is a generic 500.
 */
function toTRPCError(err: unknown): TRPCError {
  if (err instanceof GithubConnectorError) {
    switch (err.reason) {
      case "not_connected":
      case "missing_scope":
        return new TRPCError({ code: "FORBIDDEN", message: err.message });
      case "token_revoked":
        return new TRPCError({ code: "UNAUTHORIZED", message: err.message });
    }
  }
  if (err instanceof TRPCError) return err;
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected error while publishing to GitHub.",
  });
}

/** Test seam: lets the router use a mock octokit factory without a live GitHub. */
export interface PublishRouterDeps {
  githubDeps?: GithubClientDeps;
}

function parseSelection(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // fall through to empty
  }
  return [];
}

function parseArtifactState(raw: string): ArtifactState {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const state: ArtifactState = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") state[key] = value;
      }
      return state;
    }
  } catch {
    // fall through to empty
  }
  return {};
}

/** Loads the caller's selected artifacts as publishable records, in selection order. */
async function loadSelectedArtifacts(
  db: Database,
  userId: string,
  selection: string[],
): Promise<PublishArtifact[]> {
  if (selection.length === 0) return [];
  const rows = await db
    .select()
    .from(skills)
    .where(eq(skills.userId, userId));

  const byName = new Map(rows.map((row) => [row.name, row]));
  const artifacts: PublishArtifact[] = [];
  for (const name of selection) {
    const row = byName.get(name);
    if (!row) continue; // a selected artifact was deleted; silently skip it
    artifacts.push({
      name: row.name,
      description: row.description,
      content: row.content,
      author: row.author,
      version: row.version,
    });
  }
  return artifacts;
}

export function createPublishRouter(deps: PublishRouterDeps = {}) {
  return {
    /**
     * Reports the caller's publish configuration and last-published state, plus a
     * per-artifact view (every library artifact with its include flag and state:
     * published / changed / pending / removed).
     */
    status: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const target = await ctx.db.query.publishTargets.findFirst({
        where: eq(publishTargets.userId, userId),
      });

      const library = await ctx.db
        .select()
        .from(skills)
        .where(eq(skills.userId, userId));

      const selection = target ? parseSelection(target.selection) : [];
      const selectionSet = new Set(selection);
      const previous = target ? parseArtifactState(target.artifactState) : {};

      const artifacts = library.map((row) => {
        const included = selectionSet.has(row.name);
        const currentHash = hashContent(
          renderArtifactSkill({
            name: row.name,
            description: row.description,
            content: row.content,
            author: row.author,
            version: row.version,
          }).content,
        );
        const publishedHash = previous[row.name];
        let state: "published" | "changed" | "pending" | "excluded";
        if (!included) {
          state = "excluded";
        } else if (publishedHash === undefined) {
          state = "pending";
        } else if (publishedHash === currentHash) {
          state = "published";
        } else {
          state = "changed";
        }
        return {
          name: row.name,
          description: row.description,
          category: row.category ?? "skill",
          included,
          state,
        };
      });

      // Artifacts that were published but no longer exist in the library.
      const libraryNames = new Set(library.map((row) => row.name));
      const removed = Object.keys(previous).filter(
        (name) => !libraryNames.has(name),
      );

      const url =
        target?.repoOwner && target.repoName
          ? `https://github.com/${target.repoOwner}/${target.repoName}`
          : null;

      return {
        configured: target !== undefined,
        repoName: target?.repoName ?? null,
        repoOwner: target?.repoOwner ?? null,
        visibility: (target?.visibility ?? "public") as "public" | "private",
        selection,
        lastPublishedAt: target?.lastPublishedAt ?? null,
        lastCommitSha: target?.lastCommitSha ?? null,
        url,
        artifacts,
        removed,
      };
    }),

    /**
     * Upserts the caller's publish target: destination repo name, visibility, and
     * which artifacts to include. Does not touch GitHub.
     */
    configure: protectedProcedure
      .input(
        z.object({
          repoName: z
            .string()
            .min(1)
            .max(100)
            .regex(
              /^[A-Za-z0-9._-]+$/,
              "Repo name may only contain letters, numbers, '.', '_', and '-'.",
            ),
          visibility: VisibilitySchema.default("public"),
          selection: z.array(z.string().min(1)).default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;
        const selectionJson = JSON.stringify(input.selection);

        const existing = await ctx.db.query.publishTargets.findFirst({
          where: eq(publishTargets.userId, userId),
        });

        if (existing) {
          await ctx.db
            .update(publishTargets)
            .set({
              repoName: input.repoName,
              visibility: input.visibility,
              selection: selectionJson,
            })
            .where(eq(publishTargets.userId, userId));
        } else {
          await ctx.db.insert(publishTargets).values({
            userId,
            repoName: input.repoName,
            visibility: input.visibility,
            selection: selectionJson,
          });
        }

        return {
          repoName: input.repoName,
          visibility: input.visibility,
          selection: input.selection,
        };
      }),

    /**
     * Renders the selected artifacts and publishes them to GitHub. Idempotent: if
     * the desired content matches the last publish, it makes NO commit and returns
     * `committed: false`. Otherwise it creates the repo if missing and commits the
     * full tree via the Git Data API, then records the new state.
     */
    run: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const target = await ctx.db.query.publishTargets.findFirst({
        where: eq(publishTargets.userId, userId),
      });
      if (!target) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No publish target configured. Set a repo and select artifacts in Settings first.",
        });
      }

      const selection = parseSelection(target.selection);
      const artifacts = await loadSelectedArtifacts(ctx.db, userId, selection);
      if (artifacts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Select at least one artifact to publish in Settings before publishing.",
        });
      }

      const previous = parseArtifactState(target.artifactState);
      const desired = computeArtifactState(artifacts);
      const diff = diffPublish(previous, desired);

      // Idempotency: unchanged AND already published -> no commit, no GitHub write.
      if (!diff.changed && target.lastCommitSha) {
        const url = target.repoOwner
          ? `https://github.com/${target.repoOwner}/${target.repoName}`
          : null;
        return {
          committed: false,
          unchanged: true,
          url,
          commitSha: target.lastCommitSha,
          summary: "Already up to date; nothing to publish.",
        };
      }

      let octokit: PublishOctokit;
      let login: string;
      try {
        ({ octokit, login } = await getAuthenticatedGithubClient(
          ctx.db,
          userId,
          deps.githubDeps,
        ));
      } catch (err) {
        throw toTRPCError(err);
      }

      const files = renderArtifacts(artifacts);
      const message = buildCommitMessage(diff);

      let result;
      try {
        result = await publishTree(octokit, {
          owner: login,
          repo: target.repoName,
          isPrivate: target.visibility === "private",
          files,
          message,
        });
      } catch (err) {
        throw toTRPCError(err);
      }

      await ctx.db
        .update(publishTargets)
        .set({
          repoOwner: login,
          lastCommitSha: result.commitSha,
          lastPublishedAt: new Date(),
          artifactState: JSON.stringify(desired),
        })
        .where(eq(publishTargets.userId, userId));

      return {
        committed: true,
        unchanged: false,
        url: result.htmlUrl,
        commitSha: result.commitSha,
        summary: message,
      };
    }),
  } satisfies TRPCRouterRecord;
}

/** The default publish router used by the app (real octokit). */
export const publishRouter = createPublishRouter();
