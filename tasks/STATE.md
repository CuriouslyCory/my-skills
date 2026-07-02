# Orchestration State: feat/hosted-service-architecture

Source of truth for this run. Update after every state change (plan saved, agent dispatched, gate passed, branch merged). If the run is interrupted, read this file first to resume.

- Integration branch: `feat/hosted-service-architecture`
- Base branch / final PR target: `main`
- PR model: `single`
- Tracking context: PRD `tasks/prd-hosted-service-architecture.md`; issues #18 to #29 on GitHub (CuriouslyCory/my-skills)
- Last updated: 2026-07-02 by orchestrator (Wave 4 serialized; #22 dispatched)

## Status legend

- `not-started` no worktree yet
- `planning` running the per-item planning step
- `planned` plan file written, ready for agents
- `in-progress` specialist agents executing
- `review` review steps running
- `fixing` applying review fixes
- `verified` lint, typecheck, build, tests, and acceptance criteria all green in the worktree
- `merged` merged into integration and integration re-verified
- `blocked` waiting on a dependency, a failed gate, or a human gate (see Notes)

## Wave 1 (parallel): branch from `main` (integration tip)

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #18 | `feat/18-ms-apply` | removed | #18 | none | `plans/18.md` | merged | yes |
| #19 | `feat/19-postgres-dialect` | removed | #19 | none | `plans/19.md` | merged | yes |

## Wave 2 (sequential): branch from post-Wave-1 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #20 | `feat/20-multi-user-auth` | removed | #20 | #19 | `plans/20.md` | merged | yes |

HITL: RESOLVED 2026-07-02. better-auth accepted (PRD Open Question 1). Merged at 7e859b6. OPEN human action (does not block integration): register GitHub OAuth callback `http://localhost:3000/api/auth/callback/github` (+ prod `<BETTER_AUTH_URL>/api/auth/callback/github`) on OAuth app client_id Ov23lidkmLRcGHH7gkjW. Drive dev via localhost (not 127.0.0.1) or better-auth returns INVALID_ORIGIN.

## Wave 3 (parallel): branch from post-Wave-2 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #21 | `feat/21-per-user-scoping` | removed | #21 | #20 | `plans/21.md` | merged | yes |
| #28 | `feat/28-github-connector` | removed | #28 | #20 | `plans/28.md` | merged | yes |

Wave 3 SERIALIZED (user decision 2026-07-02): #21 merged at a18b4e1; #28 branched from that tip. #28 HITL: scope model already settled by PRD Non-Goals (OAuth incremental scope, no GitHub App v1). Only open human dep is the OAuth callback registration (from #20) for the live repo-scope round-trip.

## Wave 4 (parallel): branch from post-Wave-3 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #22 | `feat/22-access-tokens` | `../wt-22` | #22 | #21 | `plans/22.md` | in-progress | no |
| #26 | `feat/26-web-persistence` | (after #22) | #26 | #21 | `plans/26.md` | not-started | no |

Wave 4 SERIALIZED (orchestrator call 2026-07-02): both edit apps/web settings-page.tsx AND both would generate pg migration 0003 (guaranteed conflict). Run #22, merge, then branch #26 from post-#22 tip (its migration becomes 0004; settings-page already has the tokens section).

## Wave 5 (parallel): branch from post-Wave-4 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #23 | `feat/23-cli-api-client` | `../wt-23` | #23 | #22 | `plans/23.md` | not-started | no |
| #27 | `feat/27-vercel-neon-deploy` | `../wt-27` | #27 | #20, #26 | `plans/27.md` | not-started | no |

HITL: #27 needs Neon + Vercel projects and env vars.

## Wave 6 (parallel): branch from post-Wave-5 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #24 | `feat/24-cloud-fav` | `../wt-24` | #24 | #23 | `plans/24.md` | not-started | no |
| #25 | `feat/25-personal-library-install` | `../wt-25` | #25 | #23 | `plans/25.md` | not-started | no |

Shared-surface flag: #24 x #25 both build on the #23 CLI API client and may both edit CLI command registration.

## Wave 7 (sequential): branch from post-Wave-6 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #29 | `feat/29-ms-publish` | `../wt-29` | #29 | #28, #25 | `plans/29.md` | not-started | no |

## Verification gates

Record pass/fail and date when each item clears its gate in-worktree, before merge.

| Item | Lint | Typecheck | Build | Tests | Acceptance criteria | Item-specific check |
| --- | --- | --- | --- | --- | --- | --- |
| #18 | pass | pass | pass | pass | pass | postinstall hook mode exercised end-to-end (pnpm + npm scratch projects) |
| #19 | pass | pass | pass | pass | pass | both dialects: SQLite FTS5 live + Postgres tsvector SQL asserted |
| #20 | pass | pass | pass (incl web) | pass | pass | browser-verified: signup 200, protected route 401 when signed out, local auto-provision; OAuth authorize URL well-formed (callback registration pending, human) |
| #21 | pass | pass | pass (incl web) | pass | pass | scoping.test.ts 11/11: two users, no cross-user read/update/delete; per-user uniques |
| #22 | - | - | - | - | - | token issue + verify + revoke path |
| #23 | - | - | - | - | - | login/logout/whoami round-trip |
| #24 | - | - | - | - | - | fav persists to cloud + reads back |
| #25 | - | - | - | - | - | `@me/<name>` install resolves |
| #26 | - | - | - | - | - | `DEPLOY_MODE` gating both branches |
| #27 | - | - | - | - | - | HITL: deploy config validated with real Neon + Vercel |
| #28 | pass | pass | pass (incl web) | pass | pass | HTTP-verified: base sign-in scope=read:user user:email (no repo); connect adds repo; verifyConnection returns FORBIDDEN not 500. Live round-trip pending OAuth callback registration |
| #29 | - | - | - | - | - | `ms publish` to agentskills.io repo |

## Integration re-verification log

After each merge, re-run lint, typecheck, build, and tests on the integration branch and log the result.

| Date | After merging | Lint | Typecheck | Build | Tests | Conflicts resolved | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-02 | #18 | pass | pass | pass | pass | none | Node must be 24.14.0 (per .nvmrc); 24.13.x mis-loads eslint.config.ts via native TS stripping and reports false type errors |
| 2026-07-02 | #19 | pass | pass | pass | pass | none | turbo.json merged cleanly; all 4 env additions (#18 + #19) preserved. Integration pushed at da855a5 |
| 2026-07-02 | #20 | pass | pass | pass (incl web) | pass | none | no conflict; web built locally (Edge middleware ok). Integration pushed at 7e859b6 |
| 2026-07-02 | #21 | pass | pass | pass (incl web) | pass | none | no conflict. Integration pushed at a18b4e1 |
| 2026-07-02 | #28 | pass | pass | pass (incl web) | pass | none | no conflict; no new migration (reuses better-auth account row). First web build failed on a db-seed race, clean on retry. Integration pushed at 042600c |

## Decisions / ADRs to confirm

| Decision | Item | Recorded | Confirmed at PR review |
| --- | --- | --- | --- |
| Auth stack choice: better-auth (PRD Open Question 1) | #20 | yes (merged 7e859b6) | no |
| GitHub OAuth callback URL registration on the OAuth app | #20 | pending (human) | no |
| GitHub connector scope model: OAuth incremental scope (no GitHub App, no fine-grained PAT), per PRD Non-Goals | #28 | yes (merged 042600c) | no |
| Neon + Vercel deployment topology and env config | #27 | no | no |

## Finalization checklist

- [ ] All items show `merged`
- [ ] Final full lint, typecheck, build, and test suite green on `feat/hosted-service-architecture`
- [ ] PR opened into `main` (single-PR model)
- [ ] PR body includes `Closes #18` through `Closes #29`
- [ ] PR body summarizes every decision/ADR for sign-off
- [ ] All worktrees removed; merged item branches deleted
- [ ] Final PR left for human review (orchestrator does not self-merge)

## Notes and blockers

Use this space for anything that affected the run: a failed gate and how it was resolved, a conflict during integration, a decision rationale, or a reason an item is `blocked`.

- #20, #27, #28 are HITL: expect the run to pause at each for human setup (OAuth app, Neon/Vercel, repo scope). #20 is the earliest and blocks most of the graph, so raise its ask as soon as Wave 2 begins.
- TOOLCHAIN: verify with Node 24.14.0 (matches .nvmrc). Local 24.13.1 caused a spurious type-aware lint cascade (eslint.config.ts loaded via `unstable_native_nodejs_ts_config` mis-strips types on 24.13.x). `nvm use 24.14.0` before any gate. Default alias now set to 24.14.0.
- Wave 1 done 2026-07-02: #18 (`ms apply`) and #19 (postgres dialect) both merged to integration, full CI gate green. Integration at da855a5.
- #19 note for #27 (deploy): Postgres search uses on-the-fly to_tsvector/ts_headline (unindexed; consider a GIN index for scale). Deploy must set DB_DIALECT=postgres + POSTGRES_URL and run `pnpm --filter @curiouslycory/db migrate:pg` (not `db:push`, which is SQLite-only).
- Wave 2 done 2026-07-02: #20 merged at 7e859b6, full gate green (incl local web build).
- #20 note for #21 (scoping): `Session` from `packages/auth` exposes `ctx.session.user.id` in tRPC context; `protectedProcedure` enforces it. #21 filters/writes by that id directly.
- #20 note for #22 (PATs): add an api_tokens table alongside the 4 better-auth tables (user/session/account/verification, both dialects) and resolve `Authorization: Bearer` into the same `Session` shape in the tRPC context.
- #20 arch constraint: better-auth runtime is kept OUT of packages/api and the Edge middleware (Node-only imports break Edge). Read multi-user status via `@curiouslycory/auth/env` (zod-only, edge-safe) or `isMultiUserAuthEnabled()` in Node. Respect this in #21/#22.
- To copy .env into a worktree that needs live auth/db: `cp .env ../wt-<id>/.env` after creating the worktree (untracked, does not follow the branch).
- Wave 3 done 2026-07-02: #21 (a18b4e1) + #28 (042600c) both merged, gates green. Integration at 042600c.
- #28 note for #29 (publish): call `getAuthenticatedGithubClient(db, userId)` from packages/api and handle its not_connected / missing_scope / token_revoked errors (github router shows the mapping to FORBIDDEN/UNAUTHORIZED). Disconnect forgets our token but does not revoke the GitHub-side grant.
- GATE TIP: seed the db (`pnpm db:push`) in a SEPARATE step before `pnpm --filter @curiouslycory/web build`. Chaining them can race (next build collects page data that hits the db); a failed web build on first try is often this race, retry cleanly before assuming a regression.
- STILL PENDING (human, blocks live OAuth for #20 + #28): register callback `http://localhost:3000/api/auth/callback/github` on OAuth app Ov23lidkmLRcGHH7gkjW and confirm it permits `repo` scope.
