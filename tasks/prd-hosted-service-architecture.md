# PRD: Hosted Service Architecture (Cloud Accounts, CLI Auth, GitHub Publishing, Postinstall Mode)

## Introduction

Today, my-skills is a fully local system: the web-ui is a single-admin Next.js app bound to a local SQLite file (`packages/db/src/client.ts` hard-throws unless `DB_DIALECT === "sqlite"`), auth is an env-var admin + `jose` JWT (`packages/auth/src/index.ts`), and the CLI (`apps/cli`, npm package `my-skills`) is entirely local + git with no HTTP client. The only bridge between web-ui and CLI is a one-way file sync (`packages/api/src/lib/config-sync.ts`) that only works on the same machine.

This feature updates the general model to a **hosted service**: the web app deploys to Vercel backed by Postgres (Neon), supports real multi-user accounts, and becomes the canonical store for each user's personal agents, skills, and favorites. The CLI gains an auth flow (`ms login`) so an authenticated user can access their personal library from any machine. An optional GitHub connector lets users publish their library as an agentskills.io-compatible skills repository. The CLI remains fully functional without auth for installing from public agentskills.io/GitHub sources, and gains a non-interactive apply mode so it can run as a `postinstall` hook when added as a dev dependency.

**Supersedes:** the same-machine sync portions of `tasks/prd-unified-data-source.md` (US-004 SQLite DAL, US-005 Postgres DAL for CLI, US-010/US-011 bidirectional file sync). The DataAccessLayer concept survives, but the CLI's remote data source becomes the hosted HTTP API, not a direct database connection.

## Decisions Made (with rationale — see Open Questions to override)

- **D-1: Auth = better-auth with GitHub OAuth (+ email/password).** `better-auth` is already in the pnpm catalog (`pnpm-workspace.yaml`) but unused — this PRD activates it. GitHub OAuth doubles as the on-ramp for the GitHub publishing connector via incremental scope authorization.
- **D-2: CLI auth = browser flow with localhost callback, code-paste fallback.** Same UX as `gh auth login` / `vercel login`. Produces a long-lived personal access token (PAT), stored hashed server-side and plaintext client-side in `~/.my-skills/credentials.json` (mode 0600), separate from `config.json` so config stays safely committable/shareable.
- **D-3: Hosted DB = Postgres on Neon via Drizzle; local single-user mode keeps SQLite.** `packages/db` becomes dialect-aware instead of SQLite-hard-coded. The hosted deployment runs Postgres-only; the existing local self-hosted web-ui keeps working on SQLite unchanged.
- **D-4: CLI talks to the server over the existing tRPC API** (`packages/api`) using `@trpc/client` with an `Authorization: Bearer <token>` header. No parallel REST surface.
- **D-5: "Personal agents"** = the user's cloud library of artifacts in the existing category model (`ArtifactCategorySchema`: `skill | agent | prompt | claudemd` in `packages/shared-types/src/index.ts`), scoped per user. The CLI addresses them with a `@me/<name>` source syntax.
- **D-6: Postinstall mode = a new idempotent `ms apply` command** driven by the existing project manifest `.my-skills.json`, guarded by env vars for CI, requiring no auth for public sources and honoring `MY_SKILLS_TOKEN` for personal ones.

## Goals

- Deploy `apps/web` to Vercel with Neon Postgres and real multi-user authentication
- Let a user authenticate the CLI (`ms login`) and access their personal agents, skills, and favorites from any machine
- Persist all web-ui saves (skills, agents, favorites, compositions, settings) to the database, scoped per user
- Provide an optional GitHub connector that publishes a user's library as an agentskills.io-compatible skills repository (directories with `SKILL.md` frontmatter)
- Keep every existing unauthenticated CLI flow working with zero behavior change (`ms add owner/repo`, agentskills.io-spec repos, local paths)
- Support `my-skills` as a dev dependency whose postinstall hook installs/updates a project's agents and skills non-interactively

## User Stories

### Phase A — Foundation: multi-user auth + Postgres

### US-001: Make packages/db dialect-aware (Postgres + SQLite)
**Description:** As a developer, I need the DB package to support Postgres so the web app can run on Vercel/Neon, without breaking local SQLite mode.

**Acceptance Criteria:**
- [ ] `packages/db` exports a Postgres Drizzle schema (`src/schema-pg.ts` or equivalent) mirroring the existing tables (`skills`, `variations`, `favorites`, `compositions`, `config`) plus new tables from US-002/US-003
- [ ] Client factory selects driver by `DB_DIALECT`: `sqlite` → existing `better-sqlite3` path (unchanged), `postgres` → `drizzle-orm/neon-http` (Vercel/serverless) with `POSTGRES_URL`
- [ ] The `DB_DIALECT === "sqlite"` hard-throw in `packages/db/src/client.ts` is removed; existing SQLite default behavior is preserved when `DB_DIALECT` is unset
- [ ] FTS: Postgres search uses `tsvector`/`ILIKE` equivalent so `packages/api/src/router/search.ts` works on both dialects (FTS5 remains SQLite-only internals)
- [ ] Drizzle migrations set up for Postgres (`drizzle-kit`), with a documented `pnpm db:push`/migrate path per dialect
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` pass

### US-002: Replace single-admin auth with better-auth multi-user accounts
**Description:** As a user, I want to sign up and sign in to the hosted web app so I have my own account and library.

**Acceptance Criteria:**
- [ ] `packages/auth` re-implemented on `better-auth` (already in the pnpm catalog): `user`, `session`, `account`, `verification` tables added to the Postgres schema
- [ ] GitHub OAuth sign-in and email/password sign-up both work
- [ ] `apps/web/src/middleware.ts` and `apps/web/src/auth/*` migrated from the `my-skills-session` jose cookie to better-auth sessions
- [ ] tRPC context (`packages/api/src/trpc.ts`) resolves the better-auth session; `protectedProcedure` requires it; `ctx.session.user.id` is available to routers
- [ ] Local self-hosted mode: when running SQLite locally with no OAuth env configured, a single local user is auto-provisioned so the existing local workflow still works without sign-up
- [ ] Login/signup pages replace the current admin form at `apps/web/src/app/(auth)/login`
- [ ] Typecheck/lint/build/test pass; verify in browser using dev-browser skill

### US-003: Scope the data model per user
**Description:** As a user, I want my skills, agents, favorites, compositions, and settings to belong to my account so multiple users can share one deployment.

**Acceptance Criteria:**
- [ ] `userId` foreign key added to `skills`, `variations` (via skill), `favorites`, `compositions`, and `config` (config becomes per-user preferences) in the Postgres schema
- [ ] Unique constraints updated to be per-user (e.g. `favorites` unique on `(userId, repoUrl, skillName)`, `skills` unique on `(userId, name)`)
- [ ] All routers in `packages/api/src/router/` (`skill`, `artifact`, `favorite`, `composition`, `config`, `search`) filter and write by `ctx.session.user.id`
- [ ] `git` router and `disk-sync.ts`/`config-sync.ts` file-writing behavior are disabled (feature-flagged off) in hosted mode — they assume a local filesystem/repo
- [ ] SQLite local mode maps everything to the auto-provisioned local user
- [ ] Typecheck/lint/build/test pass

### US-004: Personal access tokens (PATs)
**Description:** As a user, I want to create and revoke API tokens so the CLI (and CI) can act on my behalf.

**Acceptance Criteria:**
- [ ] `api_tokens` table: id, userId, name, tokenHash (SHA-256), tokenPrefix (first 8 chars for display), scopes, lastUsedAt, expiresAt?, createdAt
- [ ] Tokens are shown in full exactly once at creation; only the hash is stored
- [ ] tRPC `token` router: `create`, `list`, `revoke` (all `protectedProcedure`)
- [ ] tRPC context accepts `Authorization: Bearer mysk_<token>` and resolves it to a user session (constant-time hash compare), updating `lastUsedAt`
- [ ] Web settings page section to manage tokens (create with name, list with prefix + last used, revoke)
- [ ] Typecheck/lint/build/test pass; verify in browser using dev-browser skill

### Phase B — CLI authentication

### US-005: CLI API client
**Description:** As a developer, I need an HTTP client in the CLI so commands can call the hosted tRPC API.

**Acceptance Criteria:**
- [ ] New module `apps/cli/src/core/api-client.ts` creating a `@trpc/client` instance typed against `AppRouter` from `packages/api`
- [ ] Server base URL configurable: `config.serverUrl` (new `ConfigSchema` field, default `https://<hosted-domain>`) with `MY_SKILLS_SERVER_URL` env override
- [ ] Bearer token injected from credentials file (US-006) or `MY_SKILLS_TOKEN` env var (env wins, enabling CI)
- [ ] Clear, friendly errors for: not logged in, token revoked/expired (401), server unreachable (offline) — offline errors never crash commands that have a local fallback
- [ ] `AppRouter` type import must not pull server runtime code into the CLI bundle (type-only import; verify tsup output doesn't grow with server deps)
- [ ] Typecheck/lint/build/test pass

### US-006: `ms login`, `ms logout`, `ms whoami`
**Description:** As a user, I want to authenticate my CLI so it can access my personal library.

**Acceptance Criteria:**
- [ ] `ms login` opens the browser to `<server>/cli-auth?callback=http://127.0.0.1:<port>&name=<hostname>`; the web app (authed session required) creates a PAT and redirects to the localhost callback which captures it
- [ ] Fallback for headless/SSH: `ms login --no-browser` prints the URL and prompts to paste the token (`@inquirer/input`, already a CLI dep pattern)
- [ ] Token persisted to `~/.my-skills/credentials.json` with file mode 0600, shape `{ serverUrl, token, username }`; never written to `config.json`
- [ ] `ms whoami` calls the API and prints username + token prefix; exits non-zero with a helpful message when unauthenticated
- [ ] `ms logout` revokes the token server-side (best-effort) and deletes the credentials file
- [ ] Web side: `/cli-auth` page shows a confirm screen ("Authorize CLI on <hostname>?") before minting the token
- [ ] Typecheck/lint/build/test pass; verify browser flow using dev-browser skill

### US-007: Cloud-backed favorites in the CLI
**Description:** As an authenticated user, I want `ms fav` to read/write my account's favorites so they follow me across machines and match the web-ui.

**Acceptance Criteria:**
- [ ] When authenticated, `favorite add/remove/list` (`apps/cli/src/commands/favorite.ts`) call the `favorite` tRPC router instead of mutating `config.favoriteRepos`
- [ ] When unauthenticated, current local `config.favoriteRepos` behavior is byte-for-byte unchanged
- [ ] `ms fav list` in cloud mode shows the richer DB fields (name, type, addedAt)
- [ ] First authenticated `fav` invocation offers a one-time merge of local `favoriteRepos` into the account (prompt; `--yes` skips)
- [ ] Offline while authenticated: command fails with a clear "server unreachable" message and hint to use local mode — no silent divergence
- [ ] `find`/`add --favorite` paths that read favorites resolve from the same source (cloud when authed, local otherwise)
- [ ] Tests cover both modes (API mocked); typecheck/lint/build/test pass

### US-008: Install personal agents and skills via `@me/<name>`
**Description:** As an authenticated user, I want to install my personal agents and skills from my cloud library so any machine can pull my setup.

**Acceptance Criteria:**
- [ ] `source-parser.ts` recognizes `@me/<name>` (and `@me` for "browse all") as a new `cloud` source type added to `SourceTypeSchema`
- [ ] New tRPC procedures: `library.list` (returns user's artifacts with category + metadata) and `library.get` (returns full content/files for one artifact)
- [ ] `ms add @me/<name>` downloads the artifact and installs it through the existing pipeline (`skill-installer.ts`, adapters, manifest entry with `sourceType: "cloud"`, `computedHash` via `skill-hasher.ts`)
- [ ] `ms add @me -i` lists the user's library interactively (reuses the existing `--interactive` list UX from `commands/add.ts`)
- [ ] Artifact categories deploy to their existing `DEPLOY_PATH_MAP` targets (skills → `.agents/skills`, agents → `.agents/agents`, etc.)
- [ ] `ms update`/`ms check` detect and apply updates for `cloud`-sourced entries by comparing content hashes via the API
- [ ] Unauthenticated invocation of `@me/...` gives a clear "run `ms login` first" error
- [ ] Typecheck/lint/build/test pass

### Phase C — Hosted web persistence & deployment

### US-009: Web-ui saves persist to Postgres in hosted mode
**Description:** As a user, I want everything I create or edit in the hosted web-ui saved to the database so it is durable and machine-independent.

**Acceptance Criteria:**
- [ ] Skill/artifact/composition editors write to the DB only in hosted mode; the `dirPath`-keyed disk sync (`packages/api/src/lib/disk-sync.ts`) and `syncConfigToFile` are gated behind a "local mode" flag (e.g. `DEPLOY_MODE=local|hosted`)
- [ ] Hosted mode hides/disables the `git` page and disk-sync buttons in the UI (filesystem-dependent features)
- [ ] Creating a skill in hosted mode does not require `dirPath` (nullable already) — content lives in the `content` column
- [ ] Favorites/search/settings pages fully functional against Postgres per-user data
- [ ] Typecheck/lint/build/test pass; verify in browser using dev-browser skill

### US-010: Vercel + Neon deployment
**Description:** As the maintainer, I want a documented, reproducible Vercel deployment so the hosted service actually exists.

**Acceptance Criteria:**
- [ ] `apps/web` builds and deploys on Vercel from the monorepo (turbo-aware install/build settings; `better-sqlite3` must not be required at build time in Postgres mode)
- [ ] Required env documented and validated in `apps/web/src/env.ts`: `DB_DIALECT=postgres`, `POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID/SECRET`, `DEPLOY_MODE=hosted`
- [ ] Neon migration workflow documented (drizzle-kit migrate against `POSTGRES_URL`)
- [ ] Root `README.md` deploy section corrected — it currently references `POSTGRES_URL` + Discord OAuth that don't match the code
- [ ] A deployed preview passes: sign up, create a skill, add a favorite, create a PAT, `ms login` against it
- [ ] Typecheck/lint/build/test pass

### Phase D — GitHub publishing connector

### US-011: Connect GitHub account with repo scope
**Description:** As a user, I want to optionally connect GitHub with repo permissions so the service can publish a skills repository on my behalf.

**Acceptance Criteria:**
- [ ] Settings page "Connectors" section with a "Connect GitHub" action using better-auth's GitHub provider with incremental `repo` (or fine-grained equivalent) scope — base sign-in does NOT request repo scope
- [ ] Connector state stored per user (linked account + granted scopes); disconnect supported
- [ ] `octokit` added to `packages/api`; a `github-connector` lib resolves an authenticated Octokit client for the current user
- [ ] Clear error surface when scope is missing or token was revoked on GitHub's side
- [ ] Typecheck/lint/build/test pass; verify in browser using dev-browser skill

### US-012: Publish library as an agentskills.io-compatible repository
**Description:** As a user, I want to publish my personal skills as a public GitHub repo in the agentskills.io layout so others (and my own unauthenticated CLI) can install them.

**Acceptance Criteria:**
- [ ] Export step renders each selected artifact as a directory containing `SKILL.md` with valid frontmatter (`buildSkillContent` from `packages/shared-types/src/frontmatter.ts`) — round-trips through `parseSkillFrontmatter` without loss
- [ ] Repo layout matches what `discoverSkills` (`apps/cli/src/services/cache.ts`) already consumes: skill directories with `SKILL.md` at root or under `skills/` — i.e. published repos are installable via existing `ms add owner/repo`
- [ ] tRPC `publish` router: `configure` (target repo name, public/private, artifact selection), `run` (create repo if missing via octokit, commit tree via Git Data API, push to default branch), `status` (last publish time, commit SHA, per-artifact state)
- [ ] Re-publish is idempotent: unchanged artifacts produce no commit; changed ones produce one commit with a summary message
- [ ] Publish UI on the settings/library page with per-artifact include toggles and a visible last-published state
- [ ] `ms publish` CLI command triggers the same server-side publish and prints the result URL
- [ ] Typecheck/lint/build/test pass; verify in browser using dev-browser skill

### Phase E — Postinstall / dev-dependency mode

### US-013: `ms apply` — idempotent, non-interactive manifest install
**Description:** As a developer, I want one command that makes the project's installed skills match `.my-skills.json` so it can run in hooks and CI.

**Acceptance Criteria:**
- [ ] New `ms apply` command: reads `.my-skills.json` (`apps/cli/src/core/manifest.ts`), installs missing skills, updates changed ones (hash mismatch), and runs agent adapters — with zero prompts
- [ ] Exit codes: 0 = in sync/updated, 1 = hard failure; `--frozen` flag fails (exit 2) if anything would change, for CI verification
- [ ] Works unauthenticated for `github`/`local` sources; uses `MY_SKILLS_TOKEN` for `cloud` (`@me/...`) sources and fails those entries with a clear message when no token is present (other entries still apply; exit reflects partial failure)
- [ ] Offline behavior: entries already installed and hash-matching are left untouched; unreachable sources warn, don't crash
- [ ] `--json` output flag for tooling
- [ ] Tests for fresh install, no-op re-run, update, missing-token, and offline paths; typecheck/lint/build/test pass

### US-014: Postinstall hook support as a dev dependency
**Description:** As a team, we want `my-skills` in `devDependencies` with a postinstall hook so every `pnpm install` keeps agents and skills current for all contributors.

**Acceptance Criteria:**
- [ ] Documented recipe: `"my-skills"` as devDependency + `"postinstall": "ms apply"` (project script — the CLI package itself does NOT ship a self-running postinstall)
- [ ] `ms apply` detects hook context and degrades safely: skips entirely when no `.my-skills.json` exists in `INIT_CWD`/cwd, respects `MY_SKILLS_SKIP=1` and `CI` (skip unless `MY_SKILLS_CI=1` opts in)
- [ ] Uses `INIT_CWD` (npm/pnpm set it during lifecycle scripts) to resolve the project root, not the package's own directory
- [ ] Never fails the host `pnpm install` on network errors (warn + exit 0 in hook context; strictness available via `--frozen` in CI pipelines)
- [ ] Verified end-to-end in a scratch project with pnpm and npm: fresh clone + install produces populated `.agents/skills` and agent symlinks
- [ ] README section "Use as a dev dependency" with the recipe and env flags
- [ ] Typecheck/lint/build/test pass

## Functional Requirements

- FR-1: The web app must deploy to Vercel with Postgres (Neon) via `DB_DIALECT=postgres` + `POSTGRES_URL`; local SQLite mode must keep working unchanged when `DB_DIALECT` is unset
- FR-2: The system must support multiple user accounts (better-auth; GitHub OAuth + email/password), with all library data (`skills`, `favorites`, `compositions`, per-user config) scoped by `userId`
- FR-3: Users must be able to create, list, and revoke personal access tokens; tokens are stored hashed and displayed in full only at creation
- FR-4: `ms login` must authenticate the CLI via browser + localhost callback with a `--no-browser` paste fallback, storing credentials at `~/.my-skills/credentials.json` (0600), never in `config.json`
- FR-5: An authenticated CLI must access the user's personal agents and favorites: `ms fav` reads/writes the account, `ms add @me/<name>` installs from the personal library
- FR-6: All existing unauthenticated CLI flows (`ms add owner/repo`, agentskills.io-spec repos, local paths, `list/remove/update/check/find/init/config`) must behave identically with no login
- FR-7: Web-ui saves in hosted mode must persist to the database; filesystem-coupled features (git page, disk sync, config-file sync) must be disabled in hosted mode
- FR-8: The GitHub connector must be optional and separately consented (incremental repo scope), never requested at sign-in
- FR-9: Publishing must produce a repository installable by the existing CLI (`SKILL.md` directories per the agentskills.io spec) and be idempotent across runs
- FR-10: `ms apply` must be non-interactive, idempotent, and safe as a postinstall hook (skip on missing manifest, `MY_SKILLS_SKIP`, CI detection, `INIT_CWD` resolution, never breaking the host install)
- FR-11: `MY_SKILLS_TOKEN` env var must authenticate the CLI headlessly (CI), taking precedence over the credentials file
- FR-12: API errors must distinguish unauthenticated (prompt to login), unauthorized/revoked, and offline; commands with local fallbacks must fall back rather than crash

## Non-Goals (Out of Scope)

- No teams, organizations, or shared libraries — single-user accounts only
- No billing, plans, or quotas
- No hosting a public skills marketplace/registry — agentskills.io remains the discovery surface; we publish *to* GitHub in its format
- No real-time sync between CLI and web (request/response only)
- No direct CLI→Postgres connections (supersedes prd-unified-data-source US-005) — the API is the only remote data path
- No migration tooling from a self-hosted SQLite web-ui into a hosted account (manual re-create or publish/import via GitHub is acceptable for v1)
- No changes to the skill install pipeline internals (adapters, cache, hasher) beyond the new `cloud` source type
- No GitHub App (webhooks, installations) — OAuth token publishing only for v1
- No private-repo *installation* auth (installing from private GitHub repos via the connector token) — publish-only for v1

## Design Considerations

- Reuse the existing settings page scaffolding at `apps/web/src/app/(dashboard)/settings` for tokens and connectors sections
- Reuse `packages/ui` (shadcn/radix) components — tables, dialogs, sonner toasts — for token management and publish status
- Login/signup pages replace `apps/web/src/app/(auth)/login`; keep the current visual style
- CLI UX: follow existing conventions — `chalk` + `ora` output, `@inquirer/*` prompts, `commander` subcommand registration via `registerXCommand(program)` in `apps/cli/src/program.ts`
- `/cli-auth` authorize screen should show hostname + token name and require an explicit click (phishing resistance)

## Technical Considerations

- **better-auth** is already in the pnpm catalog — pin and adopt it; its Drizzle adapter generates the user/session/account tables for both dialects
- **tRPC type sharing to the CLI:** import `AppRouter` as a type-only import; ensure `apps/cli/tsup.config.ts` doesn't pull `packages/api` runtime (which depends on `better-sqlite3`/drizzle) into the bundle — this is the main bundling risk
- **`packages/db` dialect split:** Drizzle SQLite and Postgres schemas cannot share table objects; keep one source-of-truth shape via shared column-name constants or codegen, and put dialect-specific FTS behind the search router
- **Serverless driver:** use `@neondatabase/serverless` + `drizzle-orm/neon-http` for Vercel; connection pooling via Neon's pooled connection string
- **Token format:** `mysk_` prefix + 32 random bytes base62; store SHA-256 hash; constant-time comparison in the tRPC context resolver
- **Localhost callback:** bind ephemeral port on `127.0.0.1`, single-use nonce in the authorize URL, 5-minute expiry; token travels via redirect fragment/POST to loopback only
- **GitHub publish:** use octokit Git Data API (create blob/tree/commit/updateRef) rather than cloning — no filesystem needed on Vercel; `packages/git-service` (simple-git) stays local-only
- **Existing hard constraint to remove:** `packages/db/src/client.ts` throws unless sqlite; `turbo.json` `globalEnv` already lists `DB_DIALECT`/`DB_PATH` and passes through `VERCEL*` vars
- **Hook safety:** pnpm requires the dependency to be allowed in `onlyBuiltDependencies`/`trustedDependencies` for lifecycle scripts in some configs — document this; hence the recipe uses a *project* postinstall script rather than a package-shipped one
- **`config-sync.ts` / `disk-sync.ts`:** gate behind `DEPLOY_MODE=local`; do not delete — local mode still uses them

## Success Metrics

- A user can: sign up on the hosted app → create a skill and favorite → `ms login` → `ms fav list` and `ms add @me/<skill>` on a second machine — all within 5 minutes, no manual config
- A user with the GitHub connector can publish and then `ms add <their-login>/<repo>` the result **without auth**
- A fresh clone of a project with `my-skills` as devDependency + postinstall gets fully populated `.agents/skills` from a single `pnpm install`
- Zero regressions in unauthenticated CLI behavior (existing test suite passes untouched)
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass at every story boundary

## Open Questions

These encode the decisions D-1…D-6 — override any before implementation:

1. **Auth stack (D-1):** better-auth + GitHub OAuth assumed (it's already in the catalog). Acceptable, or prefer extending the existing jose JWT / a hosted auth provider (e.g. Neon Auth)?
2. **CLI flow (D-2):** browser + localhost callback with paste fallback, or device-code flow only (simpler server, worse UX)?
3. **Local web-ui future (D-3):** this plan keeps local SQLite mode alive behind `DEPLOY_MODE=local`. Is maintaining both modes long-term intended, or should local mode be deprecated once hosted is stable?
4. **Personal "agents" (D-5):** assumed to be the existing `agent` artifact category deployed to `.agents/agents`. Correct, or is there a richer agent model (frontmatter schema, per-tool adapters) wanted first?
5. **Publish direction:** server-side publish (chosen — works from the web-ui and thin `ms publish`) vs CLI-side publish using the user's local git credentials. Any need for the latter?
6. **prd-unified-data-source.md:** should the non-superseded pieces (config init wizard US-007/US-008, DAL abstraction US-003/US-006) be folded into this effort, kept as a separate follow-up, or dropped?
7. **agentskills.io listing:** is getting published repos *listed* on agentskills.io in scope later (submission process?), or is format compatibility sufficient?
