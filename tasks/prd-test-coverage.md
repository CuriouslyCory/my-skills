# PRD: Comprehensive Test Coverage

## Introduction

The my-skills monorepo has significant test coverage gaps identified during a 5-agent code review. The CLI has 20 test files but only ~40% flag coverage and 7 untested source files. The API has 1 test file (merge.ts). The web app has zero tests. This PRD adds ~200+ new tests across 22 stories to close these gaps.

## Goals

- Achieve CLI test coverage for all commands, flags, subcommands, and error paths
- Add API router integration tests with in-memory SQLite
- Set up web app test infrastructure and cover the 3 most complex components
- Test all recently-added error handling from the code review fixes
- Ensure every shared-types export has dedicated tests

## User Stories

### US-001: shared-types frontmatter tests
**Description:** As a developer, I need tests for `parseSkillFrontmatter` and `buildSkillContent` so that changes to the foundational parsing logic are caught by CI.

**Acceptance Criteria:**
- [ ] Add vitest config to `packages/shared-types/` — create `vitest.config.ts` with `globals: true` and add `"test": "vitest run"` script to `package.json`
- [ ] Create `packages/shared-types/src/__tests__/frontmatter.test.ts`
- [ ] Test `parseSkillFrontmatter`: valid frontmatter with all fields, missing `name` throws, missing `description` throws, empty string name throws (min(1) constraint), optional fields (license, compatibility as string, compatibility as array, metadata object, allowed-tools array), extra unknown fields pass through
- [ ] Test `buildSkillContent`: produces valid markdown with YAML frontmatter, round-trip identity (parse → build → parse returns same data), empty body handled, body with special characters preserved
- [ ] Test `AgentIdSchema`: all 10 valid agent IDs accepted, invalid string rejected
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/shared-types test passes

### US-002: skill-resolver + sourceToGitHub tests
**Description:** As a developer, I need tests for the skill resolution logic so that directory walking, frontmatter parsing, and file collection are verified.

**Acceptance Criteria:**
- [ ] Create `apps/cli/tests/core/skill-resolver.test.ts` using real temp directories (matching existing CLI test patterns with `mkdtemp`/`rm`)
- [ ] Test `resolveSkill`: finds skill in nested directory, returns correct `name`, `content`, `frontmatter`, `files` list
- [ ] Test file collection: returns sorted relative paths, handles nested subdirectories
- [ ] Test directory skipping: `node_modules` and `.git` directories skipped
- [ ] Test invalid frontmatter: SKILL.md with bad YAML logs warning via `console.warn` but doesn't throw (continues searching)
- [ ] Test skill not found: throws descriptive error when skill name doesn't exist in repo
- [ ] Test empty repo: throws when no SKILL.md files exist
- [ ] Add `sourceToGitHub` tests to existing `apps/cli/tests/services/source-parser.test.ts`: valid "owner/repo" format returns GitHubSource, throws on single segment, throws on empty string, throws on empty parts
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-003: skill-installer tests
**Description:** As a developer, I need tests for skill installation to verify file copying and hash computation.

**Acceptance Criteria:**
- [ ] Create `apps/cli/tests/core/skill-installer.test.ts` using real temp directories
- [ ] Test `installSkill`: copies all files from source to destination preserving directory structure
- [ ] Test hash computation: returns SHA-256 hex string, hash is deterministic for same content, hash changes when file content changes, hash changes when file is added/removed
- [ ] Test target directory: created automatically if it doesn't exist (recursive mkdir)
- [ ] Test nested files: subdirectories copied correctly
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-004: cache service tests
**Description:** As a developer, I need tests for the cache service so that staleness detection, skill discovery, and git operations are verified.

**Acceptance Criteria:**
- [ ] Create `apps/cli/tests/services/cache.test.ts`
- [ ] Mock `GitService` from `@curiouslycory/git-service` using `vi.mock` — mock clone, fetch, resetHard methods
- [ ] Mock `loadConfig` to return a temp directory as `cacheDir`
- [ ] Test `isCacheStale`: fresh cache (recent timestamp) returns false, expired cache returns true, missing metadata file returns true (ENOENT), corrupt metadata JSON returns true with console.warn, NaN date in metadata returns true (the bug fix from code review)
- [ ] Test `getCachedRepoPath`: returns correct path when `.git` directory exists, returns null when `.git` missing
- [ ] Test `discoverSkills`: finds all SKILL.md files in nested dirs, returns name+description from frontmatter, skips invalid frontmatter (logs warning, continues), returns empty array for repo with no skills, skips `node_modules` and `.git`
- [ ] Test `fetchRepo`: calls git.clone for new repo (no cache dir exists), calls git.fetch + git.resetHard for existing repo, writes metadata file after successful fetch
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-005: manifest error path tests
**Description:** As a developer, I need tests for the improved manifest error handling so that error type distinction (ENOENT vs SyntaxError vs ZodError) is verified.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/core/manifest.test.ts`
- [ ] Test `loadManifest` with corrupted JSON (non-JSON content): returns null, logs chalk.yellow warning about corrupted manifest
- [ ] Test `loadManifest` with invalid Zod shape (e.g. missing `version` field): returns null, logs warning about schema mismatch
- [ ] Test `loadManifest` with permission error (EACCES): re-throws the error (not swallowed)
- [ ] Test `getSkill` for missing key: returns undefined
- [ ] Test `removeSkill` for missing key: returns manifest unchanged (idempotent)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-006: migration error path tests
**Description:** As a developer, I need tests for the improved migration error handling.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/core/migration.test.ts`
- [ ] Test corrupt `skills-lock.json` (invalid JSON): returns null, logs chalk.yellow warning
- [ ] Test `sourceType` field handling: legacy "gitlab" value defaults to "github", missing field defaults to "github"
- [ ] Test valid migration: produces correct `.my-skills.json` shape with version 1, installedAt timestamp, proper sourceType
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-007: add command — restoreFromManifest + installSingleSkill errors
**Description:** As a developer, I need deeper tests for the add command's restore and install error paths.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/commands/add.test.ts`
- [ ] Test `restoreFromManifest` with non-github sourceType entry: skips with warning
- [ ] Test `restoreFromManifest` with hash mismatch: triggers re-install from remote
- [ ] Test `restoreFromManifest` with fetch failure for one skill: logs error, continues with other skills
- [ ] Test `restoreFromManifest` hash check failure: logs console.warn with error message (the code review fix)
- [ ] Test `installSingleSkill` when skill not found in repo: shows specific error message
- [ ] Test `installSingleSkill` failure: sets `process.exitCode = 1` (the code review fix)
- [ ] Test `installSingleSkill` success: updates manifest with agents field and installedAt
- [ ] Mock dependencies: fetchRepo, resolveSkill, installSkill, ora, adapters
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-008: add command — flag tests
**Description:** As a developer, I need tests for all add command flags to ensure CLI flag parsing works correctly.

**Acceptance Criteria:**
- [ ] Create `apps/cli/tests/commands/add-flags.test.ts`
- [ ] Test `--list` flag: shows discovered skills without installing (calls discoverSkills, prints table, does not call installSkill)
- [ ] Test `--all` flag: sets `--skill '*' --agent '*' -y` shorthand behavior
- [ ] Test `--skill` with comma-separated names: "skill1,skill2" parsed correctly via parseSkillNames
- [ ] Test `--agent` with valid IDs: "claude-code,cursor" validated via parseAgentIds
- [ ] Test `--agent` with invalid ID: throws error with clear message
- [ ] Test `--favorite` flag: adds repo URL to config.favoriteRepos and saves config
- [ ] Test `--global` flag: changes target directory to ~/.agents/skills
- [ ] Test `--yes` flag: skips interactive prompts
- [ ] Mock dependencies: cache, resolver, installer, inquirer, adapters, config
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-009: remove command — flag tests
**Description:** As a developer, I need tests for remove command flags.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/commands/remove.test.ts`
- [ ] Test `--skill` with comma-separated names: removes multiple skills
- [ ] Test `--all` flag: removes all installed skills
- [ ] Test `--global` flag: targets global skills directory
- [ ] Test `--yes` flag: skips confirmation prompt
- [ ] Test removal when skill not installed: shows appropriate message
- [ ] Test adapter removal failure: logs warning but continues (non-fatal)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-010: update command — single skill + error paths
**Description:** As a developer, I need tests for updating a single skill by name and error scenarios.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/commands/update.test.ts`
- [ ] Test single skill name argument: updates only the named skill
- [ ] Test skill not installed: shows error message
- [ ] Test non-github sourceType: shows "unsupported" message
- [ ] Test hash unchanged (up-to-date): shows "already up to date"
- [ ] Test successful update: changes manifest hash and installedAt
- [ ] Test fetch failure: sets `process.exitCode = 1`, shows error, summary counts failures
- [ ] Test summary output: shows correct updated/failed/up-to-date counts
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-011: list command — interactive + error handling
**Description:** As a developer, I need tests for the list command's interactive mode and error handling in scanSkillsDir.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/commands/list.test.ts`
- [ ] Test `scanSkillsDir` with ENOENT: returns empty array silently
- [ ] Test `scanSkillsDir` with other read errors: logs warning, returns partial results
- [ ] Test `scanSkillsDir` with invalid SKILL.md in one dir: logs warning about skipped skill, returns other skills
- [ ] Test `--interactive` flag: mocks inquirer checkbox, selected skills trigger removal
- [ ] Test `--json` output format: valid JSON with skill data
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-012: check command — error type distinction
**Description:** As a developer, I need tests verifying that check distinguishes between error types.

**Acceptance Criteria:**
- [ ] Extend `apps/cli/tests/commands/check.test.ts`
- [ ] Test checkSingleSkill with up-to-date hash: shows "up to date" status
- [ ] Test checkSingleSkill with different hash: shows "update available" status
- [ ] Test checkSingleSkill with network/git error: shows actual error message (not generic "remote unavailable")
- [ ] Test checkSingleSkill with non-github source: shows "unsupported source type"
- [ ] Test no manifest: shows appropriate message
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-013: registry + index + entry point tests
**Description:** As a developer, I need tests for the adapter registry, adapter lookup functions, and the CLI entry point error handler.

**Acceptance Criteria:**
- [ ] Create `apps/cli/tests/adapters/registry.test.ts`
- [ ] Test `getAdapter`: returns correct adapter for every `AgentIdSchema.options` value (all 10 agents)
- [ ] Test `getAdapter` with invalid ID: throws descriptive error
- [ ] Test `getEnabledAdapters`: returns correct adapters for a given list of agent IDs
- [ ] Test `adapterRegistry`: every registered agent has correct displayName, symlink agents get SymlinkAdapter instances, specialized agents (copilot, codex, gemini) get their specific adapter
- [ ] Test SYMLINK_AGENTS list matches expected 7 agents
- [ ] Test entry point error handling: mock `createProgram` to throw, verify `process.exitCode = 1` is set and error message is printed
- [ ] pnpm typecheck passes
- [ ] pnpm --filter my-skills test passes

### US-014: API safe-json tests
**Description:** As a developer, I need tests for the safeParseJsonArray utility.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/lib/__tests__/safe-json.test.ts`
- [ ] Test null input: returns []
- [ ] Test valid JSON array of strings: returns the array
- [ ] Test empty array: returns []
- [ ] Test invalid JSON string: returns [], logs console.warn
- [ ] Test non-array JSON (object): returns [], logs warning
- [ ] Test non-array JSON (string, number): returns [], logs warning
- [ ] Test mixed array (strings + numbers + nulls): filters to strings only, logs warning
- [ ] Test nested arrays: filters out non-string items
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/api test passes

### US-015: API test caller utility + favorite router tests
**Description:** As a developer, I need a reusable API test harness and comprehensive favorite router tests.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/test-utils.ts` with `createTestCaller` that: creates an in-memory SQLite database via `better-sqlite3(:memory:)`, applies drizzle schema (skills, favorites, compositions, config tables), initializes FTS5 via `initFTS`, returns a tRPC caller with the test DB context
- [ ] Create `packages/api/src/router/__tests__/favorite.test.ts`
- [ ] Test `favorite.add`: creates new favorite, returns existing on duplicate, handles skill-level favorite (with skillName), handles NULL skillName for repo favorites
- [ ] Test `favorite.remove`: removes by ID, handles nonexistent ID gracefully
- [ ] Test `favorite.toggle`: adds when absent, removes when present, returns `{ favorited: boolean }`
- [ ] Test `favorite.isFavorited`: returns true/false correctly, distinguishes repo vs skill favorites
- [ ] Test `favorite.list`: pagination (page, pageSize), search filter, type filter (repo/skill), sorting
- [ ] Test `favorite.stats`: returns correct total, repoCount, skillCount
- [ ] Mock `syncConfigToFile` to avoid filesystem writes during tests
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/api test passes

### US-016: skill + artifact + composition router tests
**Description:** As a developer, I need router tests for the core content management endpoints.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/router/__tests__/skill.test.ts` reusing test caller from US-015
- [ ] Skill router: test list (returns skills, filters by category), byId, create (with file write to temp dir), update, delete (removes file), syncFromDisk
- [ ] Artifact router: test list (excludes category "skill"), create with valid category, rejects invalid category
- [ ] Create `packages/api/src/router/__tests__/composition.test.ts`
- [ ] Composition router: test create, byId (resolves fragments from DB), list (checks fragment staleness), preview (merges fragments), exportMarkdown
- [ ] Use temp directory for `repoPath` in test context to handle file operations
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/api test passes

### US-017: disk-sync + config-sync tests
**Description:** As a developer, I need tests for the filesystem-to-database sync logic.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/lib/__tests__/disk-sync.test.ts` reusing test caller from US-015
- [ ] Test `scanAndSync`: adds new skills found on disk, updates existing skills when content changes, removes stale DB entries not on disk, handles invalid frontmatter (skips with error in errors array, increments skipped count)
- [ ] Test with empty skills directory: returns all zeros
- [ ] Test with missing directory: handles gracefully
- [ ] Create `packages/api/src/lib/__tests__/config-sync.test.ts`
- [ ] Test `syncConfigToFile`: assembles config from DB config rows + favorites, writes to correct path, handles invalid JSON in defaultAgents config value (logs warning, uses default)
- [ ] Use temp directories for all file assertions
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/api test passes

### US-018: search router tests (FTS5)
**Description:** As a developer, I need tests for the FTS5-powered search endpoint.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/router/__tests__/search.test.ts` reusing test caller from US-015
- [ ] The test setup must create the `skills_fts` virtual table via `initFTS` (already done by test-utils if US-015 includes it)
- [ ] Seed test data: insert 3-5 skills with varying names, descriptions, tags, content
- [ ] Test empty query: returns recent items ordered by updatedAt
- [ ] Test category filter: only returns items matching category
- [ ] Test FTS match: returns skills matching search term with snippets containing `<mark>` tags
- [ ] Test prefix matching: partial term matches (e.g., "test" matches "testing")
- [ ] Test pagination: limit and offset work correctly
- [ ] Test result shape: camelCase field mapping (dirPath not dir_path, snippet field present)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/api test passes

### US-019: Web test infrastructure setup
**Description:** As a developer, I need vitest + testing-library configured for the web app so that component tests can be written.

**Acceptance Criteria:**
- [ ] Install devDependencies in `apps/web`: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- [ ] Create `apps/web/vitest.config.ts` with: jsdom environment, path aliases (`~` maps to `./src`), CSS/image module mocks, globals enabled
- [ ] Create `apps/web/src/test-utils.tsx` with: tRPC mock provider wrapper (mock QueryClient + tRPC client), Next.js `next/navigation` mock (useRouter, useSearchParams, usePathname), custom render function wrapping providers
- [ ] Add `"test": "vitest run"` to `apps/web/package.json`
- [ ] Create one smoke test: `apps/web/src/app/_components/__tests__/smoke.test.tsx` that renders a simple div and asserts it exists
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/web test passes
- [ ] pnpm build passes

### US-020: SearchResults component tests
**Description:** As a developer, I need tests for the SearchResults component which handles debounced search, URL state sync, category filtering, and HTML sanitization.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/_components/__tests__/search-results.test.tsx`
- [ ] Test `parseTags` utility: valid JSON array returns tags, invalid JSON returns empty array
- [ ] Test `sanitizeSnippet` utility: strips script tags, preserves `<mark>` tags, handles null/undefined input
- [ ] Test component render: shows search input, renders category filter tabs
- [ ] Test search input: typing updates the search state (use `vi.useFakeTimers` for debounce testing)
- [ ] Test category filter: clicking a category tab filters results
- [ ] Test result cards: render with correct links and tag badges
- [ ] Test empty state: shows appropriate message when no results
- [ ] Mock tRPC `search.query` to return controlled test data
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/web test passes

### US-021: FavoriteList component tests
**Description:** As a developer, I need tests for the FavoriteList component which handles pagination, filtering, sorting, and mutations.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/_components/__tests__/favorite-list.test.tsx`
- [ ] Test render: shows table with favorite items
- [ ] Test search input: filters favorites by name
- [ ] Test type filter buttons: "All", "Repos", "Skills" filter correctly
- [ ] Test pagination: Previous/Next buttons, page indicator
- [ ] Test empty state: shows appropriate message
- [ ] Test remove action: triggers confirmation dialog, calls `favorite.remove` mutation on confirm
- [ ] Mock tRPC `favorite.list` and `favorite.remove`
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/web test passes

### US-022: SkillList component tests
**Description:** As a developer, I need tests for the SkillList component which handles tag parsing, category filtering, and skill display.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/_components/__tests__/skill-list.test.tsx`
- [ ] Test `parseTags`: JSON array parsed correctly, invalid JSON returns empty
- [ ] Test `collectAllTags`: deduplicates tags across skills
- [ ] Test render: shows skill cards with name, description, tags
- [ ] Test category filter: filters skills by category
- [ ] Test tag filter: clicking a tag badge filters to matching skills
- [ ] Test empty state: shows message when no skills exist
- [ ] Test links: skill cards link to correct detail page
- [ ] Mock tRPC `skill.list`
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @curiouslycory/web test passes

## Functional Requirements

- FR-1: Every CLI command must have tests for all documented flags and subcommands
- FR-2: All error handling paths added during the code review fixes must have dedicated tests
- FR-3: API routers must be tested with real SQLite (in-memory) for data integrity
- FR-4: Web components must be tested with React Testing Library for user interaction simulation
- FR-5: Shared types must have round-trip tests proving parse/build identity

## Non-Goals

- No E2E/Playwright tests (separate future effort)
- No performance/load testing
- No visual regression testing for web components
- No test coverage for pure UI components (Card, Badge, Button from @curiouslycory/ui)
- No test coverage for auth package (thin wrapper around jose)
- No test coverage for git-service package (thin wrapper around simple-git)

## Technical Considerations

- CLI package filter name is `my-skills` (not `cli`) — use `pnpm --filter my-skills test`
- API package uses vitest with `globals: true`
- `better-sqlite3` includes FTS5 by default — no special build needed
- Next.js App Router requires mocking `next/navigation` (NOT `next/router`)
- Web components use `"use client"` directive — testing with jsdom works
- Existing CLI tests use real temp directories with `mkdtemp`/`rm` pattern — follow this
- The `zod` package is not a direct CLI dependency — use `(err as Error).name === "ZodError"` not `instanceof`

## Success Metrics

- All 22 stories pass their respective test suites
- Zero regressions in existing 20 CLI test files + 1 API test file
- Every CLI command has at least one test per documented flag
- Every API router has CRUD operation tests
- Web app has working test infrastructure and 3 complex components tested
