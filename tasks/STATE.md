# Orchestration State: feat/hosted-service-architecture

Source of truth for this run. Update after every state change (plan saved, agent dispatched, gate passed, branch merged). If the run is interrupted, read this file first to resume.

- Integration branch: `feat/hosted-service-architecture`
- Base branch / final PR target: `main`
- PR model: `single`
- Tracking context: PRD `tasks/prd-hosted-service-architecture.md`; issues #18 to #29 on GitHub (CuriouslyCory/my-skills)
- Last updated: 2026-07-02 by orchestrator (ALL 12 MERGED; opening final PR)

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
| #22 | `feat/22-access-tokens` | removed | #22 | #21 | `plans/22.md` | merged | yes |
| #26 | `feat/26-web-persistence` | removed | #26 | #21 | `plans/26.md` | merged | yes |

Wave 4 SERIALIZED (orchestrator call 2026-07-02): both edit apps/web settings-page.tsx AND both would generate pg migration 0003 (guaranteed conflict). Run #22, merge, then branch #26 from post-#22 tip (its migration becomes 0004; settings-page already has the tokens section).

## Wave 5 (parallel): branch from post-Wave-4 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #23 | `feat/23-cli-api-client` | removed | #23 | #22 | `plans/23.md` | merged | yes |
| #27 | `feat/27-vercel-neon-deploy` | removed | #27 | #20, #26 | `plans/27.md` | merged | yes |

Wave 5 PARALLEL (disjoint: #23 CLI vs #27 deploy config). #23 AFK. #27: user chose provision-Neon-via-MCP + Vercel config/docs (user deploys). Neon project my-skills-hosted (id blue-forest-65866795, db neondb, org Cory) provisioned 2026-07-02; migrations 0000-0003 applied (all 10 tables verified). POSTGRES_URL in wt-27/.env (gitignored, NEVER commit). Agent verifies app against real Neon in hosted+postgres mode; does NOT deploy to Vercel. #27 does NOT block #29.

## Wave 6 (parallel): branch from post-Wave-5 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #24 | `feat/24-cloud-fav` | removed | #24 | #23 | `plans/24.md` | merged | yes |
| #25 | `feat/25-personal-library-install` | removed | #25 | #23 | `plans/25.md` | merged | yes |

Wave 6 PARALLEL (orchestrator call 2026-07-02). Likely overlap: apps/cli/src/commands/add.ts (#24 --favorite path vs #25 @me/ source path — different code paths, expect auto-merge). No schema/migration. Resolve add.ts at 2nd merge if it conflicts.

## Wave 7 (sequential): branch from post-Wave-6 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #29 | `feat/29-ms-publish` | removed | #29 | #28, #25 | `plans/29.md` | merged | yes |

Wave 7 (final) done: #29 merged at bc28b7a. Live publish-to-GitHub needs a connected account (repo scope) = the still-pending OAuth callback registration.

## Verification gates

Record pass/fail and date when each item clears its gate in-worktree, before merge.

| Item | Lint | Typecheck | Build | Tests | Acceptance criteria | Item-specific check |
| --- | --- | --- | --- | --- | --- | --- |
| #18 | pass | pass | pass | pass | pass | postinstall hook mode exercised end-to-end (pnpm + npm scratch projects) |
| #19 | pass | pass | pass | pass | pass | both dialects: SQLite FTS5 live + Postgres tsvector SQL asserted |
| #20 | pass | pass | pass (incl web) | pass | pass | browser-verified: signup 200, protected route 401 when signed out, local auto-provision; OAuth authorize URL well-formed (callback registration pending, human) |
| #21 | pass | pass | pass (incl web) | pass | pass | scoping.test.ts 11/11: two users, no cross-user read/update/delete; per-user uniques |
| #22 | pass | pass | pass (incl web) | pass | pass | HTTP e2e: Bearer mysk_ token authenticates as right user, #21 scoping holds, list never exposes hash/plaintext, revoke works; constant-time compare |
| #23 | pass | pass | pass (incl web + CLI bundle) | pass | pass | live login/whoami/logout round-trip; creds 0600; CLI bundle 546KB->102KB, 0 server runtime (better-sqlite3/drizzle/octokit absent); /cli-auth loopback-guarded |
| #24 | pass | pass | pass (CLI; web unaffected) | pass | pass | 17 tests both modes; unauth byte-for-byte unchanged; one-time merge (~/.my-skills/favorites-merge.json, --yes skips); offline clear error; CLI bundle 0 server runtime |
| #25 | pass | pass | pass (incl web) | pass | pass | @me/<name> parses to cloud; library.list/get per-user (cross-user null); installs via existing pipeline+hash; ms apply partial-failure exit; unauth clear error; CLI bundle 0 server runtime |
| #26 | pass | pass | pass (incl web) | pass | pass | HTTP both modes: hosted /git 404 + dirPath null persists + git router PRECONDITION_FAILED; local /git 200 + disk sync active. No migration needed (dirPath already nullable, content col existed) |
| #27 | pass | pass | pass (sqlite + postgres web builds) | pass | pass | REAL Neon e2e (hosted+pg): signup/skill/favorite/PAT/Bearer all persisted then cleaned up. better-sqlite3 lazy-load proven by renaming addon. 576 tests |
| #28 | pass | pass | pass (incl web) | pass | pass | HTTP-verified: base sign-in scope=read:user user:email (no repo); connect adds repo; verifyConnection returns FORBIDDEN not 500. Live round-trip pending OAuth callback registration |
| #29 | pass | pass | pass (incl web) | pass | pass | SKILL.md round-trips + real discoverSkills installs it; Git Data API flow (mocked octokit); idempotent (0 commits when unchanged); migration 0004 publish_targets. Live publish pending connected GitHub account |

## Integration re-verification log

After each merge, re-run lint, typecheck, build, and tests on the integration branch and log the result.

| Date | After merging | Lint | Typecheck | Build | Tests | Conflicts resolved | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-02 | #18 | pass | pass | pass | pass | none | Node must be 24.14.0 (per .nvmrc); 24.13.x mis-loads eslint.config.ts via native TS stripping and reports false type errors |
| 2026-07-02 | #19 | pass | pass | pass | pass | none | turbo.json merged cleanly; all 4 env additions (#18 + #19) preserved. Integration pushed at da855a5 |
| 2026-07-02 | #20 | pass | pass | pass (incl web) | pass | none | no conflict; web built locally (Edge middleware ok). Integration pushed at 7e859b6 |
| 2026-07-02 | #21 | pass | pass | pass (incl web) | pass | none | no conflict. Integration pushed at a18b4e1 |
| 2026-07-02 | #28 | pass | pass | pass (incl web) | pass | none | no conflict; no new migration (reuses better-auth account row). First web build failed on a db-seed race, clean on retry. Integration pushed at 042600c |
| 2026-07-02 | #22 | pass | pass | pass (incl web) | pass | none | merged on top of user commit 914a965 (added skills + orchestration files; no app/deploy code). No conflict; orchestration files preserved. Web build hit stale SQLite WAL lock, clean after removing db+wal+shm. Pushed at c6a54c4 |
| 2026-07-02 | #26 | pass | pass | pass (incl web) | pass | none | no conflict. Flushed a LATENT db#test flake: turbo-cached green all prior waves; #26's DEPLOY_MODE globalEnv busted the cache, forcing a real db#test run which timed out under parallel load. Fixed with a 20s testTimeout in packages/db/vitest.config.ts (commit 1027a4d). Integration pushed at 1027a4d |
| 2026-07-02 | #27 | pass | pass | pass (sqlite + pg web) | pass | none | no conflict. Verified on real Neon then cleaned up. Pushed at 41d0bd1 |
| 2026-07-02 | #23 | pass | pass | pass (incl web + CLI) | pass | none | turbo.json auto-merged (both #23+#27 touched globalEnv; all preserved). plans/27.md preserved (2-dot-diff artifact). Web build hit WAL-lock flake, clean on retry. Pushed at 9b29acd |
| 2026-07-02 | #24 | pass | pass | pass (CLI; web unaffected) | pass | none | no conflict; add.ts kept minimal by agent. CLI-only, skipped redundant web build. Pushed at af70c45 |
| 2026-07-02 | #25 | pass | pass | pass (incl web) | pass | none | PARALLEL merge SUCCESS: add.ts auto-merged both #24 favorite writer + #25 cloud dispatch (localized edits via coordination notes worked). #24 files preserved. Pushed at 2c71de1 |
| 2026-07-02 | #29 | pass | pass | pass (incl web) | pass | none | no conflict; migration 0004 (publish_targets) applied to Neon too. Integration pushed at bc28b7a. ALL 12 MERGED |

## Decisions / ADRs to confirm

| Decision | Item | Recorded | Confirmed at PR review |
| --- | --- | --- | --- |
| Auth stack choice: better-auth (PRD Open Question 1) | #20 | yes (merged 7e859b6) | no |
| GitHub OAuth callback URL registration on the OAuth app | #20 | pending (human) | no |
| GitHub connector scope model: OAuth incremental scope (no GitHub App, no fine-grained PAT), per PRD Non-Goals | #28 | yes (merged 042600c) | no |
| Neon + Vercel deployment: env schema + vercel.json + lazy better-sqlite3; verified on real Neon | #27 | yes (merged 41d0bd1) | no |
| Env name correction: code reads AUTH_SECRET, NOT BETTER_AUTH_SECRET (issue text was wrong); documented real name | #27 | yes (merged 41d0bd1) | no |

## Finalization checklist

- [x] All items show `merged` (12/12)
- [x] Final full lint, typecheck, build, and test suite green on `feat/hosted-service-architecture` (tip bc28b7a)
- [ ] PR opened into `main` (single-PR model)
- [ ] PR body includes `Closes #18` through `Closes #29`
- [ ] PR body summarizes every decision/ADR for sign-off
- [x] All worktrees removed (only main working tree remains)
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
- GATE TIP: before `pnpm --filter @curiouslycory/web build`, remove ALL sqlite files (`rm -f data/my-skills.db data/my-skills.db-wal data/my-skills.db-shm`) then `pnpm db:push`, as a SEPARATE step. next build collects page data with concurrent workers; a stale WAL lock or seed race causes "SqliteError: database is locked" / "Failed to collect page data". This is environmental, NOT a code regression: kill stray `next` procs, wipe db+wal+shm, reseed, rebuild once. Seen on #28 and #22 waves; clean on retry both times.
- Wave 4 done 2026-07-02: #22 (c6a54c4) + #26 (9113403) merged; hygiene commit 1027a4d (db test timeout). Integration at 1027a4d. 7 of 12 issues merged (#18,#19,#20,#21,#28,#22,#26).
- #26 note for #27 (deploy): set DEPLOY_MODE=hosted + DB_DIALECT=postgres + POSTGRES_URL. Both flags validated in apps/web/src/env.ts + turbo.json globalEnv. Hosted disables git/disk/config-file sync; CLI local git publish flow unaffected.
- Wave 5 done 2026-07-02: #27 (41d0bd1) + #23 (9b29acd) merged. 9 of 12 issues merged (#18,#19,#20,#21,#28,#22,#26,#27,#23). Integration at 9b29acd.
- #23 notes for #24/#25: consume apps/cli/src/core/api-client.ts (createApiClient + resolveServerUrl/resolveToken/loadCredentials) and classifyApiError/friendlyApiErrorMessage/AuthRequiredError. tRPC proxy is fully typed; favorite.* and a future library.* callable with no extra wiring.
- OPEN decision from #23: config.serverUrl defaults to placeholder https://my-skills.dev (no canonical hosted domain yet). Overridable via MY_SKILLS_SERVER_URL. Set the real domain once Vercel deploy has a URL.
- Wave 6 done 2026-07-02: #24 (af70c45) + #25 (2c71de1) merged. Parallel add.ts merge succeeded cleanly. 11 of 12 issues merged; only #29 remains. Integration at 2c71de1.
- #25 notes for #29 (ms publish): library.get/list read by per-user-unique artifact name; publish (write) reuses existing skill.create/artifact.create DB writes, so #29 is mainly the CLI publish command + connector wiring. Manifest carries `category` on cloud entries. Cloud artifacts are single-file (SKILL.md, one content column) - multi-file skills would need a files/resources extension first.
- CONTEXT: user committed 914a965 mid-run (added the orchestration-builder + bulletproof-plan skills and tasks/STATE.md + orchestrator-prompt.md; no app/deploy code despite the "standardize deploy pattern" message). Integration local == origin. tasks/STATE.md is now tracked; orchestrator keeps editing it on disk (uncommitted) as the live source of truth.
- STILL PENDING (human, blocks live OAuth for #20 + #28): register callback `http://localhost:3000/api/auth/callback/github` on OAuth app Ov23lidkmLRcGHH7gkjW and confirm it permits `repo` scope.
- #27 merged 41d0bd1. Neon my-skills-hosted (blue-forest-65866795) migrated + verified + cleaned to pristine. REMAINING HUMAN DEPLOY STEPS (Vercel, user does these): 1) create Vercel project, Root Directory = apps/web (vercel.json handles turbo install/build); 2) set env DB_DIALECT=postgres, POSTGRES_URL=<neon>, DEPLOY_MODE=hosted, AUTH_SECRET (openssl rand -base64 32), BETTER_AUTH_URL=https://<prod>, GITHUB_CLIENT_ID/SECRET; 3) run migrate:pg against prod POSTGRES_URL; 4) register GitHub callback https://<prod>/api/auth/callback/github; 5) deploy + smoke test. Neon POSTGRES_URL is in orchestrator's records (not committed).
