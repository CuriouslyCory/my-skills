Tracking context: PRD `tasks/prd-hosted-service-architecture.md` (source of truth). Issues #18 to #29 on GitHub (CuriouslyCory/my-skills), each linking back to its US-xxx.

| Item | Slice | Tracker key | Blocked by |
| --- | --- | --- | --- |
| #18 | `ms apply` + postinstall hook mode | #18 | none |
| #19 | Postgres dialect support in `packages/db` | #19 | none |
| #20 | Multi-user auth via better-auth (HITL) | #20 | #19 |
| #21 | Per-user data scoping | #21 | #20 |
| #22 | Personal access tokens | #22 | #21 |
| #23 | CLI API client + `ms login`/`logout`/`whoami` | #23 | #22 |
| #24 | Cloud-backed `ms fav` | #24 | #23 |
| #25 | Install personal library via `@me/<name>` | #25 | #23 |
| #26 | Hosted web persistence + `DEPLOY_MODE` gating | #26 | #21 |
| #27 | Vercel + Neon deployment (HITL) | #27 | #20, #26 |
| #28 | GitHub connector, incremental repo scope (HITL) | #28 | #20 |
| #29 | Publish as agentskills.io repo + `ms publish` | #29 | #28, #25 |

You are the **orchestrator**. Drive all items below to completion autonomously, fanning out Sonnet specialist agents to do the implementation. Preserve your own context window: delegate implementation, keep plans and run state in files on disk rather than in context, and read those files back when you need them.

## Configuration

- Base branch: `main`
- Integration branch: `feat/hosted-service-architecture`
- PR model: `single`
- Per-item planning: `/bulletproof-plan`

## Human-in-the-loop (HITL) items

Three items cannot be completed by an agent alone because they need human-only setup or sign-off. When you reach one, do the agent-implementable work, then **stop and report** with a precise ask; do not fabricate credentials or self-approve.

- **#20 Multi-user auth via better-auth**: needs a GitHub OAuth app (client id/secret) and auth-stack sign-off (PRD Open Question 1). This is the first gate and blocks most of the graph, so surface it early.
- **#28 GitHub connector**: needs the OAuth app's incremental repo scope confirmed and any app-config secrets.
- **#27 Vercel + Neon deployment**: needs a Neon project and Vercel project plus their environment variables.

## Branching and worktree model

There is exactly one long-lived integration branch for this effort.

1. Create the integration branch from the latest base:
   ```
   git switch main && git pull
   git switch -c feat/hosted-service-architecture
   git push -u origin feat/hosted-service-architecture
   ```
2. Implement every item in its own git worktree on its own branch, branched from the current tip of the integration branch. Separate worktrees are what let parallel items proceed without sharing a working tree:
   ```
   git worktree add ../wt-<item> -b feat/<item-slug> feat/hosted-service-architecture
   ```
3. Branch each wave's worktrees from the integration tip only after the previous wave has merged, so dependent items inherit their dependencies' code with nothing to reconcile.

## Waves

Run items wave by wave. Within a wave, run items in parallel. Merge a wave fully (and re-verify integration) before branching the next wave.

### Wave 1 (parallel): branch from `main` (integration tip)
- #18 `ms apply` + postinstall hook mode. Depends on: none. Slug `feat/18-ms-apply`. Surface: CLI apply path (disjoint from #19).
- #19 Postgres dialect support in `packages/db`. Depends on: none. Slug `feat/19-postgres-dialect`. Surface: `packages/db` (disjoint from #18).

### Wave 2 (sequential): branch from post-Wave-1 integration tip
- #20 Multi-user auth via better-auth. Depends on: #19. Slug `feat/20-multi-user-auth`. **HITL:** implement what you can, then stop for the GitHub OAuth app credentials and auth-stack sign-off (PRD Open Question 1) before the verification gate can pass.

### Wave 3 (parallel): branch from post-Wave-2 integration tip
- #21 Per-user data scoping. Depends on: #20. Slug `feat/21-per-user-scoping`. **Shared-surface flag with #28:** likely both touch the db schema and the auth/session accessor. Confirm no file overlap, or split this wave.
- #28 GitHub connector, incremental repo scope. Depends on: #20. Slug `feat/28-github-connector`. **HITL** (repo scope + app secrets). **Shared-surface flag with #21** (db schema, auth/session).

### Wave 4 (parallel): branch from post-Wave-3 integration tip
- #22 Personal access tokens. Depends on: #21. Slug `feat/22-access-tokens`. **Shared-surface flag with #26:** both may touch db schema (new tables) and auth middleware / env config.
- #26 Hosted web persistence + `DEPLOY_MODE` gating. Depends on: #21. Slug `feat/26-web-persistence`. **Shared-surface flag with #22** (db schema, auth/env).

### Wave 5 (parallel): branch from post-Wave-4 integration tip
- #23 CLI API client + `ms login`/`logout`/`whoami`. Depends on: #22. Slug `feat/23-cli-api-client`. Surface: CLI client (disjoint from #27).
- #27 Vercel + Neon deployment. Depends on: #20, #26. Slug `feat/27-vercel-neon-deploy`. **HITL:** needs Neon + Vercel projects and env vars. Surface: deploy config (disjoint from #23).

### Wave 6 (parallel): branch from post-Wave-5 integration tip
- #24 Cloud-backed `ms fav`. Depends on: #23. Slug `feat/24-cloud-fav`. **Shared-surface flag with #25:** both build on the #23 CLI API client and may both edit CLI command registration.
- #25 Install personal library via `@me/<name>`. Depends on: #23. Slug `feat/25-personal-library-install`. **Shared-surface flag with #24** (API client, CLI command registration).

### Wave 7 (sequential): branch from post-Wave-6 integration tip
- #29 Publish as agentskills.io repo + `ms publish`. Depends on: #28, #25. Slug `feat/29-ms-publish`.

## Per-item loop

For each item, in wave order:

1. **Plan.** Run `/bulletproof-plan` against the item to produce an implementation plan. Save it to `plans/<item>.md` rather than holding it in context. The plan must include explicit review and verification steps.
2. **Execute.** Fan out one or more Sonnet specialist agents inside that item's worktree to implement the plan. Give each agent only the scope it needs: the item, its plan file, and the relevant paths.
3. **Review and fix.** Follow the review process defined in the plan. Apply any fixes it surfaces.
4. **Verification gate (must pass before merge).** In the item's worktree: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and all tests pass, and the item's acceptance criteria met. Honor any item-specific budget or guard noted in the plan.
5. **Decision/ADR checkpoint.** For items carrying a decision flag (the three HITL items), record the chosen decision in the worktree (file/commit) before merging, and list it for sign-off at PR review.
6. **Commit hygiene.** Conventional commits that reference the item, e.g. `feat(<area>): <change> (#<id>)`.
7. **Record progress** to `STATE.md` (status, branch, merged yes/no) so the run is resumable if interrupted.

## Merge to integration (single-PR model)

When an item passes its verification gate, merge locally and re-verify:
```
git switch feat/hosted-service-architecture && git pull
git merge --no-ff feat/<item-slug>
# run pnpm lint + pnpm typecheck + pnpm build + tests on integration; fix any merge fallout before continuing
git push
git worktree remove ../wt-<item>
```
Open no PR until every item has merged into integration.

## Finalization (once all items have merged)

1. Run the full `pnpm lint` + `pnpm typecheck` + `pnpm build` + test suite one final time on `feat/hosted-service-architecture`.
2. Open one PR: `feat/hosted-service-architecture` into `main`. In the body, include `Closes #18` through `Closes #29` (one per item) so they auto-close on merge, and summarize every decision/ADR (especially the three HITL gates) for reviewer confirmation.
3. Remove any remaining worktrees and delete merged item branches.
4. Do not merge the final PR yourself; leave it for human review.

## Guardrails

- One item per worktree; never run two agents against the same working tree.
- Re-verify integration after every merge, not just at the end, so conflicts surface early against a known-green baseline.
- If a verification gate fails and an agent cannot resolve it after a reasonable attempt, stop and report rather than merging broken work.
- For HITL items (#20, #27, #28), stop at the human gate with a precise ask; never invent credentials, OAuth apps, or infrastructure, and never self-approve a sign-off.
- Honor the project rule: never disable a lint rule or override config to make a gate pass. Fix in the spirit of the rule.
- Keep `plans/` files and `STATE.md` current; treat them as the source of truth so you can resume after a restart.
- Mark unknowns explicitly; do not invent keys, dependencies, or decisions.
