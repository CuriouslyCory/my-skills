# PRD: Unified Data Source Configuration

## Introduction

The CLI and web-ui currently use separate storage backends. The CLI reads/writes `~/.my-skills/config.json` (a flat JSON file) while the web-ui uses a SQLite database via Drizzle ORM. A one-way sync (`config-sync.ts`) pushes DB changes to the JSON file, but the CLI never reads the database. This means favorites created in the web-ui eventually appear in the JSON file, but favorites added via CLI never appear in the web-ui. Config changes are similarly fragmented.

This feature unifies both surfaces behind a shared data source. Users configure the data source type (JSON file, local SQLite, or remote Postgres via Vercel/Neon) through `ms config init` (interactive wizard) or `ms config set` (manual). Once configured, CLI and web-ui read and write the same data store. Standalone CLI usage with JSON files remains fully supported as the default.

## Goals

- Unify CLI and web-ui behind a single configurable data source
- Support three data source types: JSON file (default/standalone), local SQLite, remote Postgres (Vercel/Neon)
- Provide an interactive `ms config init` wizard for guided setup
- Preserve `ms config set/get/list/delete` for manual configuration
- Enable bidirectional data flow: changes in CLI appear in web-ui and vice versa
- Maintain full backward compatibility for standalone CLI users (JSON file mode)
- Support teams sharing a common skills database across multiple machines

## User Stories

### US-001: Add DataSource schema to shared types
**Description:** As a developer, I need a shared schema defining the data source configuration so both CLI and web-ui validate the same structure.

**Acceptance Criteria:**
- [ ] `DataSourceSchema` added to `packages/shared-types/src/index.ts` as a discriminated union with three variants: `json`, `sqlite` (with `path` field), `postgres` (with `connectionString` field)
- [ ] `ConfigSchema` extended with `dataSource` field, defaulting to `{ type: "json" }` so existing configs parse without changes
- [ ] `DataSource` type exported for use by CLI and web-ui
- [ ] Existing tests still pass (default fills in missing `dataSource` field)
- [ ] Typecheck passes

### US-002: Add lazy DB client factory
**Description:** As a developer, I need a way to create a Drizzle DB client with a configurable path without triggering the module-level side effect in `packages/db/src/client.ts`.

**Acceptance Criteria:**
- [ ] New file `packages/db/src/create-client.ts` exports `createDb(dbPath: string)` that returns a Drizzle client
- [ ] Reuses `initFTS()` from `packages/db/src/fts.ts` for full-text search setup
- [ ] Sets `journal_mode = WAL` and `busy_timeout = 5000`
- [ ] Creates the database directory if it doesn't exist
- [ ] New export `"./create-client"` added to `packages/db/package.json`
- [ ] Existing `./client` export unchanged (web-ui unaffected)
- [ ] Typecheck passes

### US-003: Create DataAccessLayer interface and JSON implementation
**Description:** As a developer, I need an abstraction layer over data storage so CLI commands can work with any data source without knowing the implementation details.

**Acceptance Criteria:**
- [ ] New package `packages/data-access/` created with proper monorepo setup (package.json, tsconfig.json)
- [ ] `DataAccessLayer` interface defined with methods: `getAllConfig()`, `getConfigValue(key)`, `setConfigValue(key, value)`, `resetConfigValue(key)`, `listFavorites()`, `addFavorite(input)`, `removeFavorite(identifier)`, `isFavorited(repoUrl, skillName?)`
- [ ] `Favorite` type defined matching the richness of the DB schema (id, repoUrl, name, description, skillName, type, addedAt)
- [ ] `JsonDataSource` implementation wraps existing `loadConfig()`/`saveConfig()` logic from `apps/cli/src/core/config.ts`
- [ ] `JsonDataSource.listFavorites()` maps `favoriteRepos: string[]` to `Favorite[]` (synthesizing name from URL, generating deterministic IDs)
- [ ] Unit tests for `JsonDataSource` using temp files
- [ ] Typecheck passes

### US-004: Create SQLite DataAccessLayer implementation
**Description:** As a developer, I need a SQLite implementation of the DataAccessLayer so the CLI can read/write the same database as the web-ui.

**Acceptance Criteria:**
- [ ] `DbDataSource` class implements `DataAccessLayer` interface
- [ ] Uses `createDb()` from US-002 to open the database at a configurable path
- [ ] Reads/writes the `config` and `favorites` tables defined in `packages/db/src/schema.ts`
- [ ] After any mutation, calls `syncConfigToFile()` from `packages/api/src/lib/config-sync.ts` to keep the bootstrap JSON current
- [ ] Exposes a `close()` method to clean up the DB connection
- [ ] Unit tests using in-memory SQLite (`:memory:`)
- [ ] Typecheck passes

### US-005: Create Postgres DataAccessLayer implementation
**Description:** As a developer, I need a Postgres implementation of the DataAccessLayer so teams can share a remote database hosted on Vercel/Neon.

**Acceptance Criteria:**
- [ ] `PostgresDataSource` class implements `DataAccessLayer` interface
- [ ] Connects to Postgres via a connection string (compatible with Vercel Postgres / Neon)
- [ ] Uses Drizzle ORM with `drizzle-orm/neon-http` or `drizzle-orm/node-postgres` driver
- [ ] Schema mirrors the SQLite tables (config, favorites) for compatibility
- [ ] After any mutation, calls `syncConfigToFile()` to keep the local bootstrap JSON current
- [ ] Exposes a `close()` method to clean up the connection
- [ ] Unit tests with mocked Postgres (or integration test if Neon dev DB available)
- [ ] Typecheck passes

### US-006: Create DataAccessLayer factory with dynamic imports
**Description:** As a developer, I need a factory function that reads the bootstrap config and returns the correct DataAccessLayer implementation, loading DB dependencies only when needed.

**Acceptance Criteria:**
- [ ] `createDataAccess()` factory reads `~/.my-skills/config.json` for `dataSource` field
- [ ] Returns `JsonDataSource` when `dataSource.type === "json"` (or missing/undefined)
- [ ] Dynamically imports `DbDataSource` when `dataSource.type === "sqlite"` (so `better-sqlite3` is not loaded in JSON mode)
- [ ] Dynamically imports `PostgresDataSource` when `dataSource.type === "postgres"`
- [ ] Clear error message if required dependency is not installed (e.g., `better-sqlite3` missing)
- [ ] Unit tests for factory routing logic
- [ ] Typecheck passes

### US-007: Add `ms config init` interactive wizard
**Description:** As a user, I want to run `ms config init` to walk through a guided setup of my data source and preferences so I don't have to know all the config keys.

**Acceptance Criteria:**
- [ ] New `init` subcommand added to the existing `config` command in `apps/cli/src/commands/config.ts`
- [ ] Step 1: Prompts for data source type with select menu: "JSON file (standalone)" / "Local SQLite database" / "Remote Postgres (Vercel/Neon)"
- [ ] Step 2 (SQLite): Prompts for DB path with default `~/.my-skills/my-skills.db`
- [ ] Step 2 (Postgres): Prompts for connection string
- [ ] Step 3: Prompts for skills directory (default: `.agents/skills`)
- [ ] Step 4: Prompts for auto-detect agents (confirm, default: true)
- [ ] Step 5: Prompts for symlink behavior (select: copy/symlink)
- [ ] Step 6: Prompts for default agents (checkbox from AgentId enum)
- [ ] Step 7 (switching to DB from JSON): Offers to migrate existing favorites and config values into the database
- [ ] Writes final config to `~/.my-skills/config.json`
- [ ] Displays summary of configured values
- [ ] `@inquirer/select` added as CLI dependency
- [ ] Tests for wizard flow with mocked inquirer prompts
- [ ] Typecheck passes

### US-008: Extend `ms config set/get` for dataSource keys
**Description:** As a user, I want to manually set data source configuration via `ms config set` so I can script my setup or adjust individual settings without re-running the wizard.

**Acceptance Criteria:**
- [ ] `ms config set dataSource.type sqlite` sets the data source type
- [ ] `ms config set dataSource.path /path/to/db` sets the SQLite DB path
- [ ] `ms config set dataSource.connectionString postgres://...` sets the Postgres connection string
- [ ] `ms config get dataSource.type` returns the current data source type
- [ ] `ms config get dataSource` returns the full data source object
- [ ] `ms config list` displays the dataSource field alongside other config keys
- [ ] Validates the resulting `dataSource` object against `DataSourceSchema` before saving
- [ ] Clear error messages for invalid combinations (e.g., setting `path` when type is `json`)
- [ ] Tests for set/get with dataSource keys
- [ ] Typecheck passes

### US-009: Refactor CLI `favorite` command to use DataAccessLayer
**Description:** As a user, I want my CLI favorites to be stored in the same place the web-ui reads them so I don't have to add favorites twice.

**Acceptance Criteria:**
- [ ] `favorite add` uses `dal.addFavorite()` instead of directly mutating `config.favoriteRepos`
- [ ] `favorite remove` uses `dal.removeFavorite()`
- [ ] `favorite list` uses `dal.listFavorites()` and displays richer data when in DB mode (description, type, timestamp)
- [ ] When using JSON mode, behavior is identical to current implementation
- [ ] When using SQLite/Postgres mode, favorites appear in the web-ui without manual sync
- [ ] Existing favorite tests updated to mock `createDataAccess()`
- [ ] New tests for DB-mode favorite operations
- [ ] Typecheck passes

### US-010: Update web-ui DB client to respect bootstrap config
**Description:** As a user, I want the web-ui to automatically use the same database I configured via the CLI so I don't have to set `DB_PATH` manually.

**Acceptance Criteria:**
- [ ] `packages/db/src/client.ts` reads `~/.my-skills/config.json` synchronously at startup
- [ ] DB path resolution order: `DB_PATH` env var > `dataSource.path` from config.json > `./data/my-skills.db`
- [ ] When `dataSource.type === "postgres"`, the web-ui uses the Postgres connection instead of SQLite
- [ ] Existing web-ui behavior unchanged when no `dataSource` is configured (falls back to defaults)
- [ ] Typecheck passes

### US-011: Add bidirectional config sync
**Description:** As a user, I want config changes made via CLI to appear in the web-ui and vice versa so both surfaces stay in sync.

**Acceptance Criteria:**
- [ ] New `syncFileToDb(db)` function added to `packages/api/src/lib/config-sync.ts`
- [ ] Reads `~/.my-skills/config.json` and upserts config keys into the `config` table (only if not already present in DB, to avoid overwriting web-ui changes)
- [ ] Upserts `favoriteRepos` entries into the `favorites` table (skips existing)
- [ ] Called on web-ui startup (in tRPC context or app initialization)
- [ ] Existing `syncConfigToFile()` continues to work (DB -> JSON, called after web-ui mutations)
- [ ] Tests for both sync directions
- [ ] Typecheck passes

### US-012: Add dependencies and build configuration
**Description:** As a developer, I need the CLI to bundle correctly with the new database dependencies.

**Acceptance Criteria:**
- [ ] `better-sqlite3` added as a dependency to `apps/cli/package.json`
- [ ] `@curiouslycory/data-access` and `@curiouslycory/db` added as dependencies to `apps/cli/package.json`
- [ ] `better-sqlite3` listed in `external` in CLI's tsup config (native addon cannot be bundled)
- [ ] `pnpm build` succeeds for all packages
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes

## Functional Requirements

- FR-1: The system must support three data source types: `json` (default), `sqlite`, and `postgres`
- FR-2: The `json` data source must preserve current behavior exactly (backward compatible)
- FR-3: The `sqlite` data source must read/write the same tables the web-ui uses (`config`, `favorites`, `skills`, `variations`, `compositions`)
- FR-4: The `postgres` data source must connect via a standard connection string compatible with Vercel Postgres and Neon
- FR-5: The `~/.my-skills/config.json` file must always exist as a bootstrap config containing the `dataSource` field
- FR-6: When using `sqlite` or `postgres` mode, the bootstrap JSON must be kept in sync after every mutation (via `syncConfigToFile()`)
- FR-7: The `ms config init` wizard must walk users through all configuration options interactively
- FR-8: The `ms config set` command must support dot-notation for nested `dataSource` fields
- FR-9: The CLI `favorite` command must use the DataAccessLayer, not direct config file access
- FR-10: The web-ui must respect the `dataSource` configuration from the bootstrap config for DB path resolution
- FR-11: The web-ui must sync CLI-made changes from the JSON file into the database on startup
- FR-12: When switching from JSON to DB mode via the wizard, existing favorites and config must be migrated

## Non-Goals

- No changes to the project manifest (`.my-skills.json`) — this remains file-based and project-local
- No changes to the skill installation/removal workflow (adapters, cache, etc.)
- No real-time sync between CLI and web-ui (eventual consistency via file sync is sufficient)
- No multi-user conflict resolution (last-write-wins is acceptable)
- No GUI for data source configuration in the web-ui (CLI-only for now)
- No migration tooling for moving data between source types (beyond the initial JSON-to-DB migration in the wizard)

## Technical Considerations

- `better-sqlite3` is a native Node addon — it must remain in `external` during CLI bundling via tsup
- The factory pattern with dynamic `import()` ensures `better-sqlite3` is never loaded when using JSON mode, keeping the CLI lightweight for standalone users
- SQLite WAL mode + `busy_timeout = 5000` handles concurrent CLI and web-ui access
- The existing `packages/db/src/client.ts` has a module-level side effect (eagerly opens a DB connection) — the new `create-client.ts` avoids this for CLI use
- Postgres support requires adding `drizzle-orm/neon-http` or `pg` as dependencies; these should also be dynamically imported
- The `packages/data-access` package should list `@curiouslycory/db` as a peer dependency to enable lazy loading

## Success Metrics

- A user can run `ms config init`, select SQLite, add a favorite via CLI, and see it in the web-ui without any manual sync steps
- A user can add a favorite in the web-ui and see it via `ms fav list` without any manual sync steps
- Existing standalone CLI users experience zero behavior changes (JSON mode is the default)
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass

## Open Questions

- Should the Postgres schema use the exact same table definitions as SQLite, or should we use a Drizzle migration to create the Postgres tables? (Drizzle supports both SQLite and Postgres schemas but they differ in column types)
- Should `ms config init` detect if the web-ui database already exists at `./data/my-skills.db` and offer to use it?
- Should the `find` command (which searches across favorite repos) also be refactored to use the DAL, or is that a follow-up?
