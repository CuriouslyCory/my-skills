# PRD: my-skills — AI Agent Skills Manager

## Introduction

Developers using AI coding agents (Claude Code, Cursor, Cline, Copilot, etc.) accumulate skills, agents, prompts, and configuration fragments across projects with no centralized way to manage, discover, or deploy them. The existing `npx skills` CLI (skills.sh) provides basic installation but lacks a web UI, composition support, multi-tool format conversion, and a favorites system for cross-repository discovery.

`my-skills` is a fully backwards-compatible replacement that provides:
1. **A CLI (`my-skills` / `ms`)** for installing, updating, removing, discovering, and managing skills across projects with support for 10 AI coding tools
2. **A Next.js web app** for browsing, editing (Plate.js WYSIWYG), searching (full-text), composing multi-fragment CLAUDE.md bundles, viewing version history/diffs, and managing favorites

Both tools operate against a git-backed skill repository. The filesystem under `skills/` and `artifacts/` is the source of truth. A Drizzle-managed database (SQLite default, swappable) serves as a search index/cache for the web app.

## Goals

- Provide a drop-in replacement for `npx skills` that reads/migrates `skills-lock.json` seamlessly
- Enable one-command deployment of skills into any project via CLI, targeting 10 AI coding tools
- Support smart agent detection — auto-detect which tools are in use, confirm with user, remember selection
- Enable browsing, full-text search, and WYSIWYG editing via a deployable web UI
- Support CLAUDE.md composition — assemble multiple fragments with intelligent heading merge
- Support a favorites system for discovering skills across multiple GitHub repositories
- Sync configuration between remote web UI and local CLI via `~/.my-skills/config.json`
- Publish the CLI as `my-skills` on npm with `ms` short alias, MIT licensed

## Personas

- **Developer**: Manages their own skills across multiple projects. Installs skills from public repos, creates custom skills, uses the CLI daily.
- **Team Lead**: Curates a shared skills library for the team. Uses the web UI to organize, tag, and compose skill bundles. Manages a favorites list of approved skill repositories.

## Project Structure

This is a **Turborepo** monorepo scaffolded from create-t3-turbo:

```
my-skills/
├── apps/
│   ├── cli/              # my-skills — CLI tool (tsup, ESM)
│   └── web/              # Next.js web app (T3 stack)
├── packages/
│   ├── api/              # @curiouslycory/api — tRPC routers
│   ├── auth/             # @curiouslycory/auth — session/JWT auth
│   ├── db/               # @curiouslycory/db — Drizzle + SQLite (adapter pattern)
│   ├── git-service/      # @curiouslycory/git-service — git abstraction
│   ├── shared-types/     # @curiouslycory/shared-types — Zod schemas, types, constants
│   └── ui/               # @curiouslycory/ui — shadcn/ui components
├── tooling/
│   ├── eslint/           # @curiouslycory/eslint-config
│   ├── prettier/         # @curiouslycory/prettier-config
│   ├── tailwind/         # @curiouslycory/tailwind-config
│   └── typescript/       # @curiouslycory/tsconfig
├── skills/               # Skill repository (skills.sh compatible)
├── artifacts/            # Non-skill artifacts
│   ├── agents/
│   ├── prompts/
│   ├── claudemds/
│   └── compositions/
├── turbo.json
└── pnpm-workspace.yaml
```

**Important constraints:**
- `.agents/skills/` is the **deployment target only** — skills are deployed here by the CLI. Never read skill data from `.agents/`.
- `skills/` is the skill library (source of truth for skills).
- `artifacts/` is the artifact library (source of truth for agents, prompts, claudemds, compositions).
- `~/.my-skills/cache/` stores shallow git clones of remote repositories.
- `~/.my-skills/config.json` stores global user configuration.

## User Stories

### Phase 1: Monorepo Foundation

#### US-001: Scaffold monorepo with create-t3-turbo
**Description:** As a developer, I need the monorepo scaffolded so that all packages can be developed and built together.

**Acceptance Criteria:**
- [ ] Run `npx create-turbo@latest -e https://github.com/t3-oss/create-t3-turbo` with non-interactive flags
- [ ] Rename namespace from `@acme/` to `@curiouslycory/` across all packages
- [ ] Root `pnpm-workspace.yaml` includes `apps/*`, `packages/*`, `tooling/*`
- [ ] Root `turbo.json` defines task pipeline: build, dev, typecheck, lint, test, clean
- [ ] Remove the expo and tanstack-start apps (keep only nextjs, renamed to `web`)
- [ ] Create empty `skills/` and `artifacts/{agents,prompts,claudemds,compositions}` directories
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `*.db`, `.env`, `.my-skills/`
- [ ] `pnpm install` succeeds from root
- [ ] `pnpm build` succeeds

#### US-002: Create shared types package
**Description:** As a developer, I need shared TypeScript types and Zod schemas so the CLI and web app use consistent definitions.

**Acceptance Criteria:**
- [ ] `packages/shared-types/` exists as `@curiouslycory/shared-types`
- [ ] Exports `ArtifactCategory` type: `'skill' | 'agent' | 'prompt' | 'claudemd'`
- [ ] Exports `AgentId` type: `'claude-code' | 'cursor' | 'cline' | 'warp' | 'amp' | 'opencode' | 'github-copilot' | 'codex' | 'gemini-cli' | 'kimi-code'`
- [ ] Exports `SkillFrontmatter` interface: name, description, license?, compatibility?, metadata?, allowed-tools?
- [ ] Exports `ManifestSchema` Zod schema with fields: version, agents[], skills record
- [ ] Exports `SkillEntrySchema`: source, sourceType, computedHash, version?, installedAt, agents?, variations?
- [ ] Exports `ConfigSchema`: defaultAgents[], favoriteRepos[], cacheDir, skillsDir, autoDetectAgents, symlinkBehavior
- [ ] Exports `CATEGORY_DIR_MAP`: category to plural directory name
- [ ] Exports `DEPLOY_PATH_MAP`: category to deploy target path
- [ ] Exports `AGENT_NATIVE_SUPPORT`: map of which agents read `.agents/skills/` natively
- [ ] Exports frontmatter utilities: `parseSkillFrontmatter()`, `buildSkillContent()`
- [ ] Package builds successfully with `turbo run build`
- [ ] Typecheck passes

#### US-003: Create git service package
**Description:** As a developer, I need a shared git abstraction so both the web app and CLI use consistent git operations.

**Acceptance Criteria:**
- [ ] `packages/git-service/` exists as `@curiouslycory/git-service`
- [ ] `GitService` class wraps `simple-git` with methods: `clone()`, `fetch()`, `pull()`, `status()`, `log()`, `diff()`, `commit()`, `push()`, `branches()`, `checkout()`, `showFileAtCommit()`
- [ ] `clone()` supports `--depth 1` for shallow clones
- [ ] All methods have proper TypeScript types
- [ ] Package builds successfully
- [ ] Typecheck passes

#### US-004: Create database package with Drizzle
**Description:** As a developer, I need the database schema so the web app can store and search skill data.

**Acceptance Criteria:**
- [ ] `packages/db/` exists as `@curiouslycory/db`
- [ ] Uses Drizzle ORM with SQLite as default dialect
- [ ] Adapter pattern in `client.ts`: reads `DB_DIALECT` env var (`sqlite`, `turso`, `postgres`)
- [ ] `skills` table: id, name, description, tags (JSON text), author, version, content, dirPath (unique), category, createdAt, updatedAt
- [ ] `variations` table: id, name, description, tags, content, filePath, skillId (FK with cascade delete)
- [ ] `favorites` table: id, repoUrl (unique), name, description, addedAt
- [ ] `compositions` table: id, name, description, fragments (JSON text), order (JSON text), createdAt, updatedAt
- [ ] `config` table: id, key (unique), value
- [ ] FTS5 virtual table `skills_fts` created via raw SQL with INSERT/UPDATE/DELETE triggers
- [ ] `db:push` script works
- [ ] Typecheck passes

### Phase 2: CLI Core

#### US-005: Scaffold CLI with Commander
**Description:** As a developer, I need the CLI scaffolded with Commander.js so I can add commands incrementally.

**Acceptance Criteria:**
- [ ] `apps/cli/` exists with `package.json` name `my-skills`
- [ ] `bin` field registers both `my-skills` and `ms` pointing to `dist/bin/my-skills.js`
- [ ] tsup config: ESM output, Node 18+ target, shebang banner for bin entry
- [ ] `program.ts` creates Commander program with name, version, description
- [ ] `my-skills --help` displays available commands
- [ ] `my-skills --version` displays version
- [ ] Vitest configured in `vitest.config.ts`
- [ ] Typecheck passes

#### US-006: Implement config system
**Description:** As a developer, I need the global config module so the CLI can store and retrieve user preferences.

**Acceptance Criteria:**
- [ ] `core/config.ts` reads/writes `~/.my-skills/config.json`
- [ ] Creates `~/.my-skills/` directory if it doesn't exist
- [ ] Config validated with `ConfigSchema` from `@curiouslycory/shared-types`
- [ ] `loadConfig()` returns validated config with defaults for missing fields
- [ ] `saveConfig()` writes atomically (tmp file + rename)
- [ ] Environment variables (`MY_SKILLS_CACHE_DIR`, etc.) override file config
- [ ] Unit tests for load, save, env override, default values
- [ ] Typecheck passes

#### US-007: Implement manifest module
**Description:** As a developer, I need the manifest module so the CLI can track which skills are installed in a project.

**Acceptance Criteria:**
- [ ] `core/manifest.ts` reads/writes `.my-skills.json` in project root
- [ ] `loadManifest()` validates with `ManifestSchema`, returns null if missing
- [ ] `saveManifest()` writes atomically with pretty-printed JSON
- [ ] `addSkill()`, `removeSkill()`, `getSkill()` are pure functions returning new manifest
- [ ] `computeSkillHash()` computes SHA-256 from all files in a skill directory (sorted for determinism)
- [ ] Unit tests for all operations including edge cases (empty manifest, missing file)
- [ ] Typecheck passes

#### US-008: Implement source parser
**Description:** As a developer, I need to parse skill source strings into structured objects so the CLI can resolve where to fetch skills from.

**Acceptance Criteria:**
- [ ] `services/source-parser.ts` parses multiple source formats:
  - `"owner/repo"` -> `{ type: "github", owner, repo, url }`
  - `"owner/repo/skill-name"` -> `{ type: "github", owner, repo, skill, url }`
  - `"https://github.com/owner/repo"` -> `{ type: "github", owner, repo, url }`
  - `"./local/path"` -> `{ type: "local", path }`
- [ ] Returns typed `SkillSource` union
- [ ] Throws descriptive error for unparseable sources
- [ ] Unit tests for all formats including edge cases
- [ ] Typecheck passes

#### US-009: Implement cache service
**Description:** As a developer, I need the cache service so the CLI can maintain shallow git clones of remote skill repositories.

**Acceptance Criteria:**
- [ ] `services/cache.ts` manages `~/.my-skills/cache/<owner>/<repo>/`
- [ ] `fetchRepo()` does shallow clone on first fetch, shallow fetch + reset on subsequent
- [ ] Stores `.my-skills-cache-meta.json` with `lastFetched` timestamp in each cache dir
- [ ] `isCacheStale()` checks against configurable TTL (default 1 hour)
- [ ] `getCachedRepoPath()` returns path if cached, null otherwise
- [ ] `discoverSkills()` walks cached repo for `SKILL.md` files, returns parsed index
- [ ] Uses `@curiouslycory/git-service` for git operations
- [ ] Unit tests with mock git service
- [ ] Typecheck passes

#### US-010: Implement skill resolver and installer
**Description:** As a developer, I need the skill resolver to locate skills in cached repos and the installer to deploy them to the canonical `.agents/skills/` location.

**Acceptance Criteria:**
- [ ] `core/skill-resolver.ts` takes a source + skill name, returns resolved skill with all file paths and content
- [ ] Searches for SKILL.md in: repo root, `skills/<name>/`, `<name>/`, and nested directories
- [ ] Parses SKILL.md frontmatter with `gray-matter`
- [ ] `core/skill-installer.ts` copies skill directory to `.agents/skills/<name>/`
- [ ] Creates parent directories if needed
- [ ] Computes and returns content hash after installation
- [ ] Unit tests for resolver (mock cache) and installer (real temp dirs)
- [ ] Typecheck passes

#### US-011: Implement skills-lock.json migration
**Description:** As a developer, I need migration logic so projects using skills.sh can seamlessly transition to my-skills.

**Acceptance Criteria:**
- [ ] `core/migration.ts` detects `skills-lock.json` when `.my-skills.json` is missing
- [ ] Transforms skills-lock format to my-skills manifest format
- [ ] Preserves all skill entries, adds `installedAt` timestamp
- [ ] Writes `.my-skills.json`, preserves `skills-lock.json` (does not delete)
- [ ] Prints informative migration message to user
- [ ] If both files exist, `.my-skills.json` takes precedence with a warning
- [ ] Optionally dual-writes to `skills-lock.json` for backwards compat (configurable)
- [ ] Unit tests for migration scenarios
- [ ] Typecheck passes

#### US-012: Implement `add` command — install from repo
**Description:** As a developer, I want `ms add owner/repo` to fetch and install skills from a GitHub repository.

**Acceptance Criteria:**
- [ ] `ms add <source>` fetches repo via cache service
- [ ] If source includes skill name (`owner/repo/skill-name`), installs that specific skill
- [ ] If source is repo-only (`owner/repo`), presents interactive picker with `@inquirer/search` showing all available skills
- [ ] Each picker item shows: skill name and description from frontmatter
- [ ] After selection, copies skill to `.agents/skills/<name>/`
- [ ] Runs agent adapter installation for all configured agents
- [ ] Updates `.my-skills.json` manifest with source, hash, installedAt, agents
- [ ] Shows success message with skill name and target path
- [ ] Shows error if skill not found in repo
- [ ] Supports `--skill <names>` flag to install specific skills without interactive picker
- [ ] Supports `--agent <agents>` flag to override default agent targets
- [ ] Supports `-y` / `--yes` flag to skip confirmation prompts
- [ ] Supports `-g` / `--global` flag to install to `~/.agents/skills/` instead
- [ ] Supports `--copy` flag to copy instead of relying on canonical + symlink
- [ ] Supports `--all` shorthand for `--skill '*' --agent '*' -y`
- [ ] Typecheck passes

#### US-013: Implement `add` command — restore from manifest
**Description:** As a developer, I want `ms add` (no arguments) to install all skills from `.my-skills.json`, like `npm install`.

**Acceptance Criteria:**
- [ ] `ms add` with no arguments reads `.my-skills.json` (or migrates from `skills-lock.json`)
- [ ] For each skill entry, resolves source via cache service
- [ ] Installs each skill that is not already present locally
- [ ] Skips skills that are already installed with matching hash
- [ ] Shows summary: N installed, N already up-to-date, N failed
- [ ] Shows per-skill errors for missing repos or invalid sources
- [ ] Typecheck passes

#### US-014: Implement `remove` command
**Description:** As a developer, I want `ms remove <skill-name>` to uninstall a skill from my project.

**Acceptance Criteria:**
- [ ] `ms remove <skill-name>` removes the skill from `.agents/skills/<name>/`
- [ ] Runs agent adapter removal for all configured agents
- [ ] Removes entry from `.my-skills.json` manifest
- [ ] Prompts for confirmation before deleting (unless `-y` flag)
- [ ] `ms remove` with no args shows interactive list of installed skills for selection
- [ ] Supports `--skill <names>` for removing multiple skills
- [ ] Supports `--agent <agents>` to remove from specific agent targets only
- [ ] Supports `-g` / `--global` to remove from global scope
- [ ] Supports `--all` shorthand
- [ ] Shows error if skill is not installed
- [ ] Shows success message after removal
- [ ] Typecheck passes

#### US-015: Implement `list` command
**Description:** As a developer, I want `ms list` to see all installed skills in my project.

**Acceptance Criteria:**
- [ ] `ms list` reads `.my-skills.json` and displays installed skills as a formatted table
- [ ] Table columns: name, source, agents, hash (truncated)
- [ ] `--global` flag lists globally installed skills from `~/.agents/skills/`
- [ ] `--agent <name>` flag filters to skills installed for a specific agent
- [ ] `--json` flag outputs machine-readable JSON (no ANSI codes)
- [ ] Shows "No skills installed" if manifest is empty or missing
- [ ] Typecheck passes

### Phase 3: Agent Adapters

#### US-016: Implement adapter interface and registry
**Description:** As a developer, I need the adapter system so skills can be deployed to different AI coding tools.

**Acceptance Criteria:**
- [ ] `adapters/types.ts` defines `AgentAdapter` interface: id, displayName, detect(), install(), remove(), sync(), getSkillsPath()
- [ ] `adapters/types.ts` defines `SkillEntry` type: name, sourcePath, frontmatter, content, files[]
- [ ] `adapters/registry.ts` exports `adapterRegistry: Map<AgentId, AgentAdapter>` with all adapters registered
- [ ] `getAdapter(id: AgentId)` returns the adapter or throws
- [ ] `getEnabledAdapters(agents: AgentId[])` returns array of adapters
- [ ] Typecheck passes

#### US-017: Implement agent detection
**Description:** As a developer, I need auto-detection so the CLI can discover which AI tools are present in a project.

**Acceptance Criteria:**
- [ ] `adapters/detect.ts` exports `detectAgents(projectRoot: string): Promise<AgentId[]>`
- [ ] Scans for tool-specific directories and files:
  - Claude Code: `.claude/` or `CLAUDE.md`
  - Cursor: `.cursor/` or `.cursorrules`
  - Cline: `.cline/` or `.clinerules`
  - Warp: `.warp/`
  - Amp: `.amp/` or `AGENTS.md`
  - OpenCode: `.opencode/`
  - GitHub Copilot: `.github/copilot-instructions.md`
  - Codex: `.codex/`
  - Gemini CLI: `.gemini/` or `GEMINI.md`
  - Kimi Code: `.kimi/`
- [ ] On first run (no agents in manifest or config), presents `@inquirer/checkbox` with detected agents pre-selected
- [ ] Saves selection to both `.my-skills.json` agents array and global config
- [ ] Prints info message: "Run `ms config set defaultAgents ...` to change defaults"
- [ ] Subsequent runs use saved config without prompting
- [ ] Unit tests for detection of each agent type
- [ ] Typecheck passes

#### US-018: Implement NativeAdapter and SymlinkAdapter
**Description:** As a developer, I need the native and symlink adapters for tools that support `.agents/skills/` or need tool-specific symlinks.

**Acceptance Criteria:**
- [ ] `NativeAdapter` is a no-op — install/remove/sync do nothing since tools read `.agents/skills/` directly
- [ ] `NativeAdapter` used for: claude-code, cline, cursor, warp, amp, opencode (all natively support `.agents/skills/`)
- [ ] `SymlinkAdapter` creates/removes symlinks from tool-specific directories to `.agents/skills/<name>/`
- [ ] Symlink paths: `.claude/skills/`, `.cursor/skills/`, `.cline/skills/`, `.warp/skills/`, `.amp/skills/`, `.opencode/skills/`
- [ ] Symlink adapter is only used when user explicitly configures it via `symlinkBehavior` config
- [ ] Falls back to copy on Windows if symlinks are not supported
- [ ] Creates parent directories if needed
- [ ] Unit tests with real temp directories
- [ ] Typecheck passes

#### US-019: Implement CopilotAdapter
**Description:** As a developer, I need the Copilot adapter to manage skill content in `.github/copilot-instructions.md`.

**Acceptance Criteria:**
- [ ] `CopilotAdapter` manages content between `<!-- my-skills:start -->` and `<!-- my-skills:end -->` markers
- [ ] `install()` adds skill content as a section within the markers: `<!-- my-skills:skill-name:start -->` / `<!-- my-skills:skill-name:end -->`
- [ ] `remove()` removes the skill's section from between its markers
- [ ] Preserves all content outside the markers
- [ ] Creates `.github/copilot-instructions.md` if it doesn't exist
- [ ] `sync()` replaces entire managed section with all current skills
- [ ] Unit tests covering: fresh file, existing content, add/remove/sync operations
- [ ] Typecheck passes

#### US-020: Implement CodexAdapter
**Description:** As a developer, I need the Codex adapter to generate skill entries in `.codex/config.toml`.

**Acceptance Criteria:**
- [ ] `CodexAdapter` reads/writes `.codex/config.toml`
- [ ] `install()` adds a `[skills.<skill-name>]` section with description and instruction content
- [ ] `remove()` removes the `[skills.<skill-name>]` section
- [ ] Preserves all other TOML content
- [ ] Creates `.codex/config.toml` with proper structure if it doesn't exist
- [ ] Uses a TOML parser/writer library (e.g., `@iarna/toml` or `smol-toml`)
- [ ] Unit tests covering: fresh file, existing config, add/remove operations
- [ ] Typecheck passes

#### US-021: Implement GeminiAdapter
**Description:** As a developer, I need the Gemini adapter to generate TOML commands and update GEMINI.md.

**Acceptance Criteria:**
- [ ] `GeminiAdapter` manages `.gemini/commands/<skill-name>.toml` files
- [ ] `install()` writes a TOML command file with skill name, description, and instructions
- [ ] `install()` also adds a reference between `<!-- my-skills:start/end -->` markers in `GEMINI.md`
- [ ] `remove()` deletes the TOML command file and removes the reference from GEMINI.md
- [ ] Creates `.gemini/commands/` directory and `GEMINI.md` if they don't exist
- [ ] Unit tests covering: fresh setup, add/remove operations
- [ ] Typecheck passes

### Phase 4: Remaining CLI Commands

#### US-022: Implement `update` command
**Description:** As a developer, I want `ms update` to update installed skills to their latest versions.

**Acceptance Criteria:**
- [ ] `ms update` with no args updates all installed skills
- [ ] `ms update <skill-name>` updates a specific skill
- [ ] For each skill: fetches latest from remote, computes new hash, compares with manifest
- [ ] If hash differs: removes old files, installs new version, updates manifest
- [ ] If hash matches: prints "already up to date"
- [ ] Re-runs agent adapter install for updated skills
- [ ] Shows summary: N updated, N already up-to-date, N failed
- [ ] Typecheck passes

#### US-023: Implement `check` command
**Description:** As a developer, I want `ms check` to see which skills have updates available without installing them.

**Acceptance Criteria:**
- [ ] `ms check` reads manifest and compares each skill against its remote source
- [ ] Fetches latest from remote for each skill
- [ ] Displays table: skill name, status (up-to-date / update available / remote unavailable)
- [ ] Shows current hash vs latest hash for outdated skills
- [ ] If local cache and remote differ, informs user which is newer
- [ ] Shows "No skills installed" if manifest is empty
- [ ] Typecheck passes

#### US-024: Implement `find` command
**Description:** As a developer, I want `ms find` to search for skills across my favorites and installed skills.

**Acceptance Criteria:**
- [ ] `ms find` with no query launches `@inquirer/search` interactive fuzzy-find
- [ ] `ms find <query>` pre-fills the search with the query
- [ ] Search index includes: all skills from cached favorite repos (fetched if stale) + currently installed skills
- [ ] Each result shows: skill name, description, source repo, installed status badge
- [ ] Fuzzy matches against name, description, and tags
- [ ] Selecting a result prompts to install (delegates to `add` flow)
- [ ] Favorites list read from global config `favoriteRepos`
- [ ] Typecheck passes

#### US-025: Implement `init` command
**Description:** As a developer, I want `ms init` to scaffold a new SKILL.md so I can create custom skills.

**Acceptance Criteria:**
- [ ] `ms init <name>` creates `.agents/skills/<name>/SKILL.md` with frontmatter template
- [ ] `ms init` with no name prompts for one
- [ ] Generated SKILL.md includes: name and description in YAML frontmatter, placeholder body
- [ ] Prompts for description
- [ ] Creates directory if it doesn't exist
- [ ] Shows error if skill already exists (suggests `--force` to overwrite)
- [ ] Typecheck passes

#### US-026: Implement `config` command
**Description:** As a developer, I want `ms config` to manage my global configuration.

**Acceptance Criteria:**
- [ ] `ms config get <key>` reads and prints a config value (dot-notation supported)
- [ ] `ms config set <key> <value>` sets a config value, validates with Zod schema
- [ ] `ms config set defaultAgents claude-code,cursor` handles comma-separated arrays
- [ ] `ms config list` pretty-prints all config key-value pairs
- [ ] `ms config delete <key>` resets a key to its default value
- [ ] All operations read from / write to `~/.my-skills/config.json`
- [ ] Typecheck passes

### Phase 5: Web App Foundation

#### US-027: Scaffold Next.js web app
**Description:** As a developer, I need the Next.js app scaffolded with the T3 stack so we can build frontend features.

**Acceptance Criteria:**
- [ ] `apps/web/` exists (renamed from nextjs in create-t3-turbo scaffold)
- [ ] Uses Next.js App Router, Tailwind CSS v4, tRPC
- [ ] `REPO_PATH` env var points to the monorepo root for filesystem operations
- [ ] Workspace dependencies on `@curiouslycory/shared-types`, `@curiouslycory/db`, `@curiouslycory/git-service`, `@curiouslycory/api`
- [ ] Extends shared tooling: `@curiouslycory/tsconfig`, `@curiouslycory/eslint-config`, `@curiouslycory/tailwind-config`
- [ ] `pnpm dev --filter web` starts the dev server without errors
- [ ] Typecheck passes

#### US-028: Implement auth package
**Description:** As a developer, I need basic auth so the deployed web app can be password-protected.

**Acceptance Criteria:**
- [ ] `packages/auth/` exists as `@curiouslycory/auth`
- [ ] Cookie-based JWT sessions using a signing secret (`AUTH_SECRET` env var)
- [ ] `validate(username, password)` checks against `ADMIN_USER` and `ADMIN_PASSWORD` env vars
- [ ] `createSession()` returns a signed JWT, `verifySession()` validates it
- [ ] Auth is **disabled** when `ADMIN_USER` is not set (local dev mode — all requests pass through)
- [ ] Exports `isAuthEnabled()` helper
- [ ] Typecheck passes

#### US-029: Implement tRPC setup and skill router
**Description:** As a developer, I need the tRPC infrastructure and skill CRUD so the frontend can manage skills.

**Acceptance Criteria:**
- [ ] `packages/api/` has tRPC router with context providing `db`, `session`, `repoPath`
- [ ] Public procedures (no auth required) and protected procedures (auth required when enabled)
- [ ] `skill.list` — returns all skills with optional category/tags/search filters
- [ ] `skill.byId` — returns single skill with full content and variations
- [ ] `skill.create` — writes SKILL.md to `skills/<name>/` on disk AND inserts into DB
- [ ] `skill.update` — updates SKILL.md on disk AND updates DB record
- [ ] `skill.delete` — removes skill directory AND deletes DB record
- [ ] `skill.syncFromDisk` — scans `skills/` directory, parses SKILL.md frontmatter, upserts into DB, removes stale entries
- [ ] All mutations use protected procedures
- [ ] All inputs validated with Zod
- [ ] Typecheck passes

#### US-030: Implement artifact router
**Description:** As a developer, I need the artifact CRUD API for agents, prompts, and claudemds.

**Acceptance Criteria:**
- [ ] `artifact.list` — returns artifacts with optional category filter
- [ ] `artifact.listByCategory` — returns artifacts of a specific category (agent/prompt/claudemd)
- [ ] `artifact.byId` — returns single artifact with full content
- [ ] `artifact.create` — writes to `artifacts/<category>/<name>/` on disk + DB
- [ ] `artifact.update` — updates on disk + DB
- [ ] `artifact.delete` — removes directory + DB record
- [ ] `artifact.syncFromDisk` — scans all `artifacts/` subdirectories, upserts to DB
- [ ] All mutations use protected procedures
- [ ] Typecheck passes

#### US-031: Implement disk sync service
**Description:** As a developer, I need a service that syncs the filesystem with the database so the web app stays current.

**Acceptance Criteria:**
- [ ] `packages/api/src/lib/disk-sync.ts` exports `scanAndSync(repoPath, db)`
- [ ] Walks `skills/*/SKILL.md` and `artifacts/*/*/SKILL.md` (or `metadata.json`)
- [ ] Parses frontmatter with `gray-matter`
- [ ] Upserts each found artifact into the `skills` DB table (matched on `dirPath`)
- [ ] Removes DB records whose `dirPath` no longer exists on disk
- [ ] Rebuilds FTS index after sync
- [ ] Called on app startup and via manual "Refresh" button
- [ ] Typecheck passes

#### US-032: Implement FTS and search router
**Description:** As a developer, I need full-text search so the web app can find skills and artifacts quickly.

**Acceptance Criteria:**
- [ ] FTS5 virtual table `skills_fts` initialized on startup via raw SQL
- [ ] INSERT/UPDATE/DELETE triggers keep FTS in sync with `skills` table
- [ ] `search.query` procedure accepts: query string, optional category filter, limit, offset
- [ ] Uses FTS5 `MATCH` with prefix matching on each term
- [ ] Returns results with highlighted snippets (FTS5 `snippet()` function)
- [ ] Results ordered by relevance (FTS5 rank)
- [ ] Handles empty queries gracefully (returns recent items)
- [ ] Typecheck passes

#### US-033: Build layout and navigation
**Description:** As a user, I want a sidebar and header so I can navigate the web app.

**Acceptance Criteria:**
- [ ] Root layout with sidebar navigation: Dashboard, Skills, Artifacts, Compositions, Git, Settings
- [ ] Header with: app title, global search input, auth status
- [ ] Active nav item is visually highlighted
- [ ] Search input navigates to `/search?q=<query>` on submit
- [ ] Login/logout button in header (shown only when auth is enabled)
- [ ] Layout is responsive (sidebar collapses on mobile)
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

### Phase 6: Web App CRUD

#### US-034: Build skill browse page
**Description:** As a user, I want to browse skills so I can discover available tooling.

**Acceptance Criteria:**
- [ ] `/skills` page shows all skills in a filterable grid/table
- [ ] Each card shows: name, description, tags as badges, category badge
- [ ] Tag filter chips for narrowing results
- [ ] Cards link to skill detail page
- [ ] Shows empty state when no skills exist
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-035: Build skill detail page
**Description:** As a user, I want to view a skill's content and metadata so I can understand what it does.

**Acceptance Criteria:**
- [ ] `/skills/[id]` page shows full skill detail
- [ ] Renders SKILL.md body as formatted markdown with syntax highlighting
- [ ] Metadata sidebar: name, description, tags, author, version
- [ ] "Edit" button linking to edit page
- [ ] "Delete" button with confirmation dialog
- [ ] Version history section (git log for the skill's directory) below content
- [ ] Each commit entry is expandable to show the diff
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-036: Implement Plate.js editor component
**Description:** As a developer, I need a reusable Plate.js WYSIWYG editor component for editing skill and artifact content.

**Acceptance Criteria:**
- [ ] `apps/web/src/app/_components/plate-editor.tsx` as client component
- [ ] Plate.js configured with plugins: paragraph, heading, bold, italic, code, code block, link, list, blockquote
- [ ] `@udecode/plate-markdown` for markdown serialization/deserialization
- [ ] `FrontmatterForm` component: separate form fields for name, description, tags (multi-input), author, version
- [ ] Editor toolbar with formatting buttons
- [ ] `onSave` callback that reassembles frontmatter + serialized markdown
- [ ] Lazy loaded via `next/dynamic`
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-037: Build skill create and edit pages
**Description:** As a user, I want to create and edit skills through the web UI.

**Acceptance Criteria:**
- [ ] `/skills/new` page with FrontmatterForm + Plate.js editor
- [ ] Submitting calls `skill.create` mutation, writes SKILL.md to disk + DB
- [ ] `/skills/[id]/edit` page loads existing skill content into editor
- [ ] `gray-matter` splits frontmatter (-> form fields) from body (-> Plate deserializer)
- [ ] Save calls `skill.update` mutation
- [ ] After save, shows toast confirmation
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-038: Build artifact browse, detail, and edit pages
**Description:** As a user, I want to browse, view, and edit artifacts (agents, prompts, claudemds).

**Acceptance Criteria:**
- [ ] `/artifacts` page with category tabs (All, Agents, Prompts, Claude.mds)
- [ ] `/artifacts/[category]` filters by category
- [ ] `/artifacts/[category]/[id]` shows artifact detail (same layout as skill detail)
- [ ] `/artifacts/[category]/[id]/edit` uses Plate.js editor
- [ ] `/artifacts/[category]/new` for creating new artifacts
- [ ] Delete with confirmation dialog
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-039: Build search results page
**Description:** As a user, I want to search and see highlighted results so I can find skills quickly.

**Acceptance Criteria:**
- [ ] `/search` page with search input (pre-filled from `?q=` param)
- [ ] Debounced input (300ms) triggers search
- [ ] Results show: name, category badge, description, content snippet with `<mark>` highlights
- [ ] Results link to skill/artifact detail page
- [ ] Optional category filter dropdown
- [ ] Shows "No results found" for empty result sets
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

### Phase 7: Composition Builder

#### US-040: Implement heading merge algorithm
**Description:** As a developer, I need the merge algorithm so compositions can intelligently combine markdown fragments.

**Acceptance Criteria:**
- [ ] `packages/api/src/lib/merge.ts` exports `mergeFragments(fragments: string[]): string`
- [ ] Parses each fragment into heading-tree sections
- [ ] Matches headings by normalized text (case-insensitive, trimmed)
- [ ] Level-offset matching: `# Foo` in fragment A matches `## Foo` in fragment B if structural pattern matches
- [ ] Matched headings: concatenate content in fragment order
- [ ] Deduplicate identical lines within merged sections
- [ ] Unmatched headings: insert at best structural position (closest matching parent chain)
- [ ] Multiple structural matches: merge into first match, stop
- [ ] Post-process: collapse 3+ consecutive blank lines to 2, ensure trailing newline
- [ ] Preamble (content before first heading) is concatenated and deduplicated
- [ ] Unit tests: no overlap, partial overlap, full overlap, level-offset matching, deduplication, ordering
- [ ] Typecheck passes

#### US-041: Implement composition tRPC router
**Description:** As a developer, I need the composition API so the frontend can create and manage compositions.

**Acceptance Criteria:**
- [ ] `composition.list` — returns all saved compositions
- [ ] `composition.byId` — returns composition with resolved fragment content
- [ ] `composition.create` — saves composition name, description, fragment references, order
- [ ] `composition.update` — updates composition
- [ ] `composition.delete` — removes composition
- [ ] `composition.preview` — accepts fragment IDs + order, runs merge algorithm, returns merged markdown
- [ ] `composition.exportMarkdown` — returns final merged markdown string
- [ ] All mutations use protected procedures
- [ ] Typecheck passes

#### US-042: Build composition builder — fragment selection
**Description:** As a user, I want to select fragments from a data table to compose a CLAUDE.md file.

**Acceptance Criteria:**
- [ ] `/compositions/new` page with data table of all claudemd artifacts
- [ ] Table columns: checkbox, name, description, tags, version, updated date
- [ ] Checkbox multi-select with "select all" header checkbox
- [ ] Selected fragments appear in a sidebar panel showing composition order
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-043: Build composition builder — drag-and-drop ordering
**Description:** As a user, I want to reorder selected fragments via drag-and-drop to control section order.

**Acceptance Criteria:**
- [ ] Selected fragments in the sidebar have drag handles
- [ ] Drag-and-drop reordering using `@dnd-kit/core` and `@dnd-kit/sortable`
- [ ] Order changes are reflected immediately
- [ ] Deselecting a fragment removes it from the order
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-044: Build composition builder — live preview
**Description:** As a user, I want to see a live preview of the merged output as I select and reorder fragments.

**Acceptance Criteria:**
- [ ] Right panel renders merged composition output using Plate.js in read-only mode
- [ ] Preview updates live as fragments are selected/deselected/reordered
- [ ] Uses `composition.preview` tRPC query (debounced)
- [ ] "Copy as Markdown" button copies raw markdown to clipboard with toast confirmation
- [ ] CLI command preview shows: `ms add claudemd <composition-name>` with "Copy Command" button
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-045: Build composition save/load
**Description:** As a user, I want to save and load compositions so I can reuse them.

**Acceptance Criteria:**
- [ ] "Save Composition" button opens dialog for name and description
- [ ] Saves fragment selection and order via `composition.create` mutation
- [ ] `/compositions` page lists saved compositions
- [ ] `/compositions/[id]` loads a saved composition, restoring multi-select state and order
- [ ] "Update" saves changes to an existing composition
- [ ] "Delete" with confirmation
- [ ] Shows "outdated" indicator when a constituent fragment has been modified since the composition was saved
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

### Phase 8: Git & Config UI

#### US-046: Build git status page
**Description:** As a user, I want to see the git status of my skills repository.

**Acceptance Criteria:**
- [ ] `/git` page shows: current branch, clean/dirty status, list of modified files
- [ ] Modified files grouped by status (staged, unstaged, untracked)
- [ ] Git log section showing recent commits with hash, message, author, date
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-047: Build diff viewer component
**Description:** As a user, I want to view diffs for specific commits so I can understand changes.

**Acceptance Criteria:**
- [ ] `_components/diff-viewer.tsx` wraps `react-diff-viewer-continued`
- [ ] Renders unified diff with syntax highlighting
- [ ] Additions in green, deletions in red
- [ ] Accessible from: version history on skill detail page (click commit to see diff) and git page
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-048: Build commit and push dialog
**Description:** As a user, I want to commit and push changes from the web UI.

**Acceptance Criteria:**
- [ ] "Commit" button opens dialog with: file checklist (select which files to stage), commit message input
- [ ] Submitting calls `git.commit` mutation
- [ ] "Push" button calls `git.push` mutation
- [ ] Shows loading spinner during operations
- [ ] Shows success/error toast after operation
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-049: Build branch selector and pull/fetch
**Description:** As a user, I want to switch branches and pull updates from the web UI.

**Acceptance Criteria:**
- [ ] Branch selector dropdown in git page header, populated by `git.branches` query
- [ ] Selecting a branch calls `git.checkout` mutation
- [ ] "Pull" button calls `git.pull` mutation, then triggers `skill.syncFromDisk` to refresh DB
- [ ] "Fetch" button calls `git.fetch` mutation
- [ ] Shows loading states and success/error toasts
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-050: Build settings page with favorites
**Description:** As a user, I want to manage my configuration and favorite repositories from the web UI.

**Acceptance Criteria:**
- [ ] `/settings` page with sections: General, Favorites, Agent Defaults
- [ ] General: default repo path display
- [ ] Favorites: list of favorite repos with "Add" form (repo URL + name) and "Remove" button
- [ ] Agent Defaults: multi-select for default agent targets
- [ ] All changes saved via `config.set` and `config.favorites.*` mutations
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-051: Implement config sync to local file
**Description:** As a developer, I need config changes from the web UI to sync to `~/.my-skills/config.json` so the CLI stays updated.

**Acceptance Criteria:**
- [ ] `packages/api/src/lib/config-sync.ts` exports `syncConfigToFile(db)`
- [ ] Reads all config and favorites from DB
- [ ] Writes assembled config object to `~/.my-skills/config.json`
- [ ] Creates `~/.my-skills/` directory if needed
- [ ] Called at the end of every config/favorites mutation (fire-and-forget, errors logged)
- [ ] Typecheck passes

### Phase 9: Polish & Testing

#### US-052: Implement CLI test suite
**Description:** As a developer, I need comprehensive tests for the CLI to ensure reliability.

**Acceptance Criteria:**
- [ ] Vitest configured in `apps/cli/vitest.config.ts`
- [ ] Shared test helpers: `createTestProject()`, `createMockCache()`, `assertManifest()`, `assertSkillInstalled()`
- [ ] Unit tests for all core modules: config, manifest, migration, source-parser, skill-resolver, skill-installer, skill-hasher
- [ ] Unit tests for all adapters: native, symlink, copilot, codex, gemini
- [ ] Integration tests for commands using Commander's `parseAsync` with `exitOverride()`
- [ ] Tests use real temp directories with cleanup
- [ ] ~80-90% line coverage across `src/core/` and `src/adapters/`
- [ ] `pnpm test --filter my-skills` passes

#### US-053: Implement merge algorithm test suite
**Description:** As a developer, I need comprehensive tests for the heading merge algorithm.

**Acceptance Criteria:**
- [ ] Tests in `packages/api/src/lib/__tests__/merge.test.ts`
- [ ] Test cases: no overlap between fragments, partial heading overlap, full overlap
- [ ] Test cases: level-offset matching (`# X` matches `## X` with same structure)
- [ ] Test cases: line deduplication within merged sections
- [ ] Test cases: ordering preservation, preamble handling
- [ ] Test cases: edge cases (empty fragments, single fragment, all-heading fragments)
- [ ] All tests pass

#### US-054: CLI packaging and publishing setup
**Description:** As a developer, I need the CLI packaged for npm publishing.

**Acceptance Criteria:**
- [ ] `apps/cli/package.json` has `bin` field: `{ "my-skills": "./dist/bin/my-skills.js", "ms": "./dist/bin/my-skills.js" }`
- [ ] `type: "module"`, `engines: { "node": ">=18" }`
- [ ] `pnpm --filter my-skills pack` produces a valid tarball
- [ ] Tarball can be installed globally and `my-skills --help` works
- [ ] `ms --help` also works (alias)
- [ ] All commands function correctly from the installed package
- [ ] Typecheck passes

#### US-055: Web app auth integration
**Description:** As a user, I want the web app to require login when deployed remotely.

**Acceptance Criteria:**
- [ ] `/login` page with username/password form
- [ ] Submitting calls `auth.login` mutation, sets session cookie
- [ ] Middleware redirects unauthenticated users to `/login` for protected routes
- [ ] Auth is completely bypassed when `ADMIN_USER` env var is not set
- [ ] Logout button clears session and redirects to login
- [ ] All mutation tRPC endpoints require auth when enabled
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

#### US-056: Responsive design and polish
**Description:** As a user, I want the web app to work well on different screen sizes.

**Acceptance Criteria:**
- [ ] Sidebar collapses to hamburger menu on mobile
- [ ] Composition builder panels stack vertically on narrow screens
- [ ] Data tables are horizontally scrollable on small screens
- [ ] Editor toolbar wraps gracefully
- [ ] All pages are usable at 320px width minimum
- [ ] Typecheck passes
- [ ] Verify in browser using dev server

## Functional Requirements

- FR-1: Skills are stored under `skills/` following the agent skills spec (SKILL.md with YAML frontmatter). `.agents/skills/` is the deployment target only.
- FR-2: Artifacts are stored under `artifacts/{agents,prompts,claudemds,compositions}/`
- FR-3: The CLI reads/migrates `skills-lock.json` for backwards compatibility with skills.sh
- FR-4: The CLI maintains its own manifest at `.my-skills.json` in project root
- FR-5: The CLI resolves remote repos via shallow git clone to `~/.my-skills/cache/`
- FR-6: `ms add <source>` installs skills to `.agents/skills/<name>/` and runs agent adapters
- FR-7: Agent adapters handle deployment to each tool: native (no-op), symlink, Copilot (markers), Codex (TOML), Gemini (TOML + GEMINI.md)
- FR-8: Agent targets are auto-detected on first run, confirmed by user, saved to config
- FR-9: `ms add` with no args restores all skills from `.my-skills.json` (like `npm install`)
- FR-10: `ms find` searches across installed skills and all favorite repository caches
- FR-11: `ms config` provides `get`/`set`/`list`/`delete` subcommands for global config
- FR-12: The web app database is a cache/index — the filesystem is the source of truth
- FR-13: The web app uses FTS5 for full-text search with snippets and relevance ranking
- FR-14: The web app uses Plate.js for WYSIWYG editing of SKILL.md content
- FR-15: The composition builder merges fragments with heading-aware logic: text matching, level-offset support, line deduplication
- FR-16: The web app supports git operations: status, log, diff, commit, push, pull, fetch, branch switching
- FR-17: Config changes in the web app sync to `~/.my-skills/config.json` for CLI offline access
- FR-18: Auth is optional — enabled only when `ADMIN_USER` env var is set
- FR-19: The CLI binary is `my-skills` with `ms` as a short alias
- FR-20: All `add` command flags from skills.sh are supported: `-g`, `-a`, `-s`, `-l`, `-y`, `--copy`, `--all`, `--full-depth`

## Non-Goals

- No `pull` command (importing skills from project back to repo) in v1
- No git conflict resolution in web UI (show error, user resolves in terminal)
- No real-time collaboration or multi-user editing
- No CI/CD pipeline for auto-publishing the CLI (manual publish)
- No skill dependency management (skills are independent)
- No notification system for upstream changes
- No skill templates or generators beyond `init`
- No npm registry publishing automation (manual `npm publish`)

## Design Considerations

- **Layout**: Sidebar navigation + top header. Clean, utilitarian developer tool aesthetic.
- **Skill cards**: Name, description, tags as badges, category indicator. Click to open detail.
- **Editor**: Plate.js WYSIWYG. Split layout: metadata form fields on top, editor below.
- **Diff viewer**: Unified diff with green/red highlighting via `react-diff-viewer-continued`.
- **Search results**: List with highlighted snippet excerpts and category filter chips.
- **Composition builder**: Three-panel layout — fragment table (left), ordered selection (center), live preview (right). Stacks vertically on mobile.
- **Markdown rendering**: GFM with syntax highlighting for read-only views.

## Technical Considerations

- **Monorepo**: Turborepo from create-t3-turbo. `@curiouslycory/` namespace. pnpm workspaces.
- **T3 Stack**: Next.js App Router + tRPC + Drizzle + Tailwind CSS v4
- **Database**: Drizzle with adapter pattern. SQLite via better-sqlite3 default. `DB_DIALECT` env var switches to Turso or Postgres.
- **FTS**: SQLite FTS5 virtual table with raw SQL (Drizzle cannot model virtual tables). Triggers for sync.
- **CLI**: Commander.js, `@inquirer/search` for fuzzy-find, `@inquirer/checkbox` for multi-select, `chalk`, `ora`. tsup ESM bundle targeting Node 18+.
- **Editor**: Plate.js with `@udecode/plate-markdown` for serialization. `gray-matter` for frontmatter parsing. Lazy loaded.
- **Git**: `simple-git` in `@curiouslycory/git-service` package shared by CLI and web.
- **Auth**: Cookie-based JWT. Environment variable credentials. Disabled in local dev.
- **Agent skills spec**: Skills follow the spec at agentskills.io — SKILL.md with name/description frontmatter.
- **Symlinks**: `.agents/skills/` is canonical. Tool-specific symlinks only when tool doesn't read `.agents/` natively or user opts in.

## Success Metrics

- A developer can install a skill from a GitHub repo in under 10 seconds via CLI
- A developer can migrate from skills.sh with zero manual steps
- Agent detection correctly identifies tools in a project on first run
- The web app loads and renders the skill list in under 1 second
- Full-text search returns relevant results in under 200ms
- The composition builder produces correct merged output for all heading merge test cases
- The CLI installs cleanly via `npm install -g my-skills` and both `my-skills` and `ms` commands work

## Open Questions

- Should `ms add` warn if the skill is already installed and suggest `ms update` instead? **Tentative answer**: Yes.
- Should the favorites system support GitLab and other forges, or GitHub only for v1? **Tentative answer**: GitHub only for v1, extensible for others.
- Should `ms update` auto-run agent adapter sync, or require a separate `ms sync` command? **Tentative answer**: Auto-run.
- What should happen when a user runs `ms add` for a skill that exists in the manifest but with a different source? **Tentative answer**: Warn and ask for confirmation.
