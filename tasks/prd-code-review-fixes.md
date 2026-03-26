# PRD: Code Review Fixes

## Introduction

A comprehensive 5-agent code review of the my-skills monorepo identified 27 findings spanning security vulnerabilities, silent failure patterns, type safety gaps, dead code, and code quality issues. This PRD organizes fixes into 21 independently-shippable user stories ordered by security priority, then dependency chain, then risk level.

## Goals

- Eliminate 3 critical security vulnerabilities (XSS, JWT fallback, CORS)
- Fix the pervasive silent-failure pattern (bare `catch {}` blocks) across CLI and API
- Strengthen type safety by applying existing Zod schemas consistently at all boundaries
- Remove dead code, phantom type variants, and T3 scaffold remnants
- Improve CLI exit codes for CI/CD compatibility

## User Stories

### US-001: Harden auth secret
**Description:** As a deployer, I want the app to refuse to start with a guessable JWT secret when auth is enabled, so that forgetting to set AUTH_SECRET doesn't create a security hole.

**Acceptance Criteria:**
- [ ] In `packages/auth/src/index.ts`, modify `getSecret()` to throw an error when `isAuthEnabled()` returns true and `AUTH_SECRET` env var is not set
- [ ] Keep the `"dev-secret-do-not-use-in-prod"` fallback only when auth is disabled (i.e., `ADMIN_USER` is not set)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-002: Sanitize search snippet HTML (XSS fix)
**Description:** As a user, I want search result snippets to be safe from XSS so that malicious skill content cannot execute scripts in my browser.

**Acceptance Criteria:**
- [ ] Install `isomorphic-dompurify` (or `sanitize-html`) as a dependency in `apps/web`
- [ ] In `apps/web/src/app/_components/search-results.tsx`, sanitize the `result.snippet` HTML before passing to `dangerouslySetInnerHTML`, allowing only the `<mark>` tag
- [ ] Verify the search highlight `<mark>` tags still render correctly
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-003: Remove CORS headers from tRPC route
**Description:** As a developer, I want the tRPC API to be same-origin only so that cross-origin requests cannot reach the API.

**Acceptance Criteria:**
- [ ] In `apps/web/src/app/api/trpc/[trpc]/route.ts`, remove the `setCorsHeaders` function entirely
- [ ] Remove the `OPTIONS` export (preflight handler)
- [ ] Remove the `setCorsHeaders(response)` call in the handler
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-004: Protect git read endpoints behind auth
**Description:** As a deployer, I want git status/log/diff/branches to require authentication when auth is enabled, so that repository information is not leaked to unauthenticated users.

**Acceptance Criteria:**
- [ ] In `packages/api/src/router/git.ts`, change `status`, `log`, `diff`, and `branches` from `publicProcedure` to `protectedProcedure`
- [ ] Import `protectedProcedure` from `../trpc` if not already imported
- [ ] Note: when auth is disabled, `getSession()` in `apps/web/src/auth/server.ts` returns `{ user: { username: "local" } }`, so protectedProcedure will pass — no special handling needed
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-005: Fix merge.ts dead code, JSDoc, and naming
**Description:** As a developer, I want the merge algorithm code to be accurate and free of dead branches so that the code matches its documentation.

**Acceptance Criteria:**
- [ ] In `packages/api/src/lib/merge.ts` function `findInMerged`: remove the duplicate condition block at lines 123-126 (identical to lines 120-122)
- [ ] The second loop (lines 138-157) can never match because the first loop already returned on `normalizedHeading` match — remove it, along with `findInMergedByStructure` and `getChildSignature` if they become unused
- [ ] Rename parameter `_sourceLevel` to `sourceLevel` (line 114) since it IS used, or remove it if the second loop is deleted
- [ ] Update the `mergeFragments` JSDoc (line 233) to remove the claim "Level-offset matching: headings with same name at different levels merge if structure matches" since that behavior is not implemented
- [ ] Existing merge tests must still pass: `pnpm --filter api test`
- [ ] pnpm typecheck passes

### US-006: Fix cache.ts error handling and NaN staleness bug
**Description:** As a CLI user, I want cache staleness checks to handle corrupted metadata correctly so that a broken cache file doesn't silently make the cache appear fresh forever.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/services/cache.ts` function `isCacheStale`: after parsing `meta.lastFetched`, check if the resulting timestamp is `NaN` and treat it as stale (return `true`)
- [ ] In the catch block, distinguish `ENOENT` (return `true` silently) from other errors (log a warning via `console.warn` then return `true`)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-007: Fix config env overrides bypassing Zod validation
**Description:** As a developer, I want environment variable overrides to be validated through the same Zod schema as the config file, so that invalid env values are caught.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/core/config.ts`, apply environment variable overrides to the `merged` object BEFORE calling `ConfigSchema.parse()`, not after
- [ ] This means moving the `process.env.MY_SKILLS_CACHE_DIR` and `process.env.MY_SKILLS_DIR` assignments (currently lines ~34-39) to before the `ConfigSchema.parse(merged)` call
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-008: Unify AdapterSkillEntry and ResolvedSkill types
**Description:** As a developer, I want a single canonical type for resolved skills so that the two identical type definitions cannot drift apart.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/adapters/types.ts`, keep `AdapterSkillEntry` as the canonical type (it has more importers)
- [ ] In `apps/cli/src/core/skill-resolver.ts`, remove the `ResolvedSkill` type definition and import `AdapterSkillEntry` from `../adapters/types` instead, re-exporting it as `ResolvedSkill` for backward compatibility: `export type ResolvedSkill = AdapterSkillEntry;`
- [ ] Update any direct imports of `ResolvedSkill` to use the re-export (check `skill-installer.ts`)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-009: Strengthen Zod schemas in shared-types
**Description:** As a developer, I want the Zod schemas to enforce real constraints so that invalid data (empty names, typo'd agent IDs, phantom source types) is caught at parse time.

**Acceptance Criteria:**
- [ ] In `packages/shared-types/src/frontmatter.ts`: add `.min(1)` to both `name` and `description` in `SkillFrontmatterSchema`
- [ ] In `packages/shared-types/src/index.ts`: change `ManifestSchema.agents` from `z.array(z.string())` to `z.array(AgentIdSchema)`
- [ ] In `packages/shared-types/src/index.ts`: remove `"gitlab"` and `"url"` from `SourceTypeSchema`, leaving only `z.enum(["github", "local"])`
- [ ] In `apps/cli/src/core/migration.ts`: update the `sourceType` cast (line ~55) to use `SourceTypeSchema.parse()` instead of `as "github" | "gitlab" | "url" | "local"`; wrap in try-catch to handle legacy entries gracefully (default to `"github"` on parse failure)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-010: Extract duplicated sourceToGitHub into shared utility
**Description:** As a developer, I want `sourceToGitHub` to exist in one place so that bug fixes don't need to be applied to three copies.

**Acceptance Criteria:**
- [ ] Add a `sourceToGitHub` function to `apps/cli/src/services/source-parser.ts` that parses an `"owner/repo"` manifest source string into a `GitHubSource`. Use the same implementation currently in `add.ts` lines 47-59
- [ ] Remove the `sourceToGitHub` function from `apps/cli/src/commands/add.ts`, `check.ts`, and `update.ts`
- [ ] Update imports in all three command files to import `sourceToGitHub` from `../services/source-parser`
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-011: Improve adapter file-read helpers — ENOENT distinction
**Description:** As a CLI user, I want adapter file reads to only return empty for missing files (not for permission errors), so that permission issues don't silently clobber my config files.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/adapters/gemini.ts` (`readFileOr`): catch only `ENOENT` errors and return the fallback; re-throw all other errors. Use `(err as NodeJS.ErrnoException).code === 'ENOENT'`
- [ ] Apply the same fix to `apps/cli/src/adapters/codex.ts` (`readTomlFile`)
- [ ] Apply the same fix to `apps/cli/src/adapters/copilot.ts` (`readCopilotFile`)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-012: Rename postRouter to skillsPreview
**Description:** As a developer, I want the T3 scaffold "post" naming cleaned up so that the router and component names match the domain (skills).

**Acceptance Criteria:**
- [ ] Rename `packages/api/src/router/post.ts` to `packages/api/src/router/skills-preview.ts`; rename the export from `postRouter` to `skillsPreviewRouter`
- [ ] In `packages/api/src/root.ts`: update import and change the router key from `post` to `skillsPreview`
- [ ] In `apps/web/src/app/_components/posts.tsx`: rename to `skills-preview.tsx`; rename components from `PostList`/`PostCard`/`PostCardSkeleton` to `SkillsPreviewList`/`SkillsPreviewCard`/`SkillsPreviewCardSkeleton`
- [ ] Grep for all `trpc.post.` references and update to `trpc.skillsPreview.`; grep for `RouterOutputs["post"]` and update
- [ ] Update the import in `apps/web/src/app/(dashboard)/page.tsx` (or wherever PostList is imported)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-013: Clean up T3 boilerplate comments and validators package
**Description:** As a developer, I want stale T3 scaffold comments removed and the empty validators package documented so the codebase doesn't mislead contributors.

**Acceptance Criteria:**
- [ ] In `packages/api/src/trpc.ts`: remove the T3 header block (lines 1-8 "YOU PROBABLY DON'T NEED TO EDIT THIS FILE..."), update the stale path reference on line ~65 from "/src/server/api/routers" to the actual path "packages/api/src/router/"
- [ ] In `packages/validators/src/index.ts`: replace the placeholder export with a comment explaining it is intentionally empty pending shared Zod schema consolidation, and keep a minimal re-export so the package compiles (e.g., `export {}`)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-014: Add CLI exit codes and top-level error handler
**Description:** As a CI/CD operator, I want the CLI to exit with code 1 on failure so that automated pipelines can detect errors.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/bin/my-skills.ts`: switch from `program.parse()` to `program.parseAsync()` with a `.catch()` handler that prints a user-friendly error and sets `process.exitCode = 1`
- [ ] In `apps/cli/src/commands/add.ts` function `installSingleSkill`: when installation fails (the catch block around line 256-273), set `process.exitCode = 1`
- [ ] In `apps/cli/src/commands/update.ts`: when an update fails, set `process.exitCode = 1`
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-015: Improve CLI config/manifest/migration error handling
**Description:** As a CLI user, I want meaningful error messages when my config or manifest files are corrupted, instead of the CLI silently falling back to defaults.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/core/manifest.ts` `loadManifest()`: catch `ENOENT` specifically and return `null`; for JSON parse errors, log a warning suggesting the file is corrupted; for Zod validation errors, log a warning suggesting a migration; for other errors (EACCES etc.), re-throw
- [ ] In `apps/cli/src/core/config.ts` `loadConfig()`: catch `ENOENT` specifically and use defaults; for other errors, log a warning with `console.warn(chalk.yellow(...))` before falling back to defaults
- [ ] In `apps/cli/src/core/migration.ts` `migrateFromSkillsLock()`: wrap the `JSON.parse(lockContent)` call (line 44) in a try-catch that warns about corrupted lock file and returns null
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-016: Create safeParseJsonArray utility and fix unsafe JSON.parse calls
**Description:** As a developer, I want JSON text columns to be parsed safely so that one corrupted database row doesn't crash entire API endpoints.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/lib/safe-json.ts` with a `safeParseJsonArray(raw: string | null): string[]` function that: tries `JSON.parse`, validates the result is an array of strings, returns `[]` on any failure with a `console.warn` log
- [ ] In `packages/api/src/router/skill.ts`: replace `JSON.parse(row.tags) as string[]` with `safeParseJsonArray(row.tags)`
- [ ] In `packages/api/src/router/composition.ts`: replace all `JSON.parse(comp.fragments) as string[]` and `JSON.parse(comp.order) as string[]` calls (lines ~20, 45, 177, 178) with `safeParseJsonArray`
- [ ] In `packages/api/src/router/search.ts`: if there is any `JSON.parse` usage on tags or similar, replace similarly
- [ ] pnpm typecheck passes
- [ ] pnpm --filter api test passes

### US-017: Improve CLI silent failure handling
**Description:** As a CLI user, I want warnings when operations partially fail so that I can diagnose issues instead of getting misleading results.

**Acceptance Criteria:**
- [ ] In `apps/cli/src/core/skill-resolver.ts` `walkForSkillByName()`: in the catch block where frontmatter parse fails (line ~62-69), add `console.warn(chalk.yellow(\`Warning: Found SKILL.md at \${fullPath} but could not parse frontmatter: \${(err as Error).message}\`))`
- [ ] In `apps/cli/src/commands/list.ts` `scanSkillsDir()`: in the readdir catch (line ~41), check for `ENOENT` specifically and return `[]`; for other errors, log a warning. In the SKILL.md parsing catch (line ~56), log a warning that the skill was skipped
- [ ] In `apps/cli/src/commands/check.ts` `checkSingleSkill()`: in the catch block (line ~75-82), distinguish error types: if `sourceToGitHub` threw, report "invalid source format"; if network/git error, report "remote unavailable"; default to logging the actual error message
- [ ] In `apps/cli/src/commands/add.ts` `restoreFromManifest()`: in the empty catch block (line ~147-149), add `console.warn` logging why the hash check failed
- [ ] pnpm typecheck passes
- [ ] pnpm --filter cli test passes

### US-018: Use ArtifactCategorySchema consistently in routers
**Description:** As a developer, I want category inputs validated against the actual enum so that invalid categories are rejected at the API boundary.

**Acceptance Criteria:**
- [ ] In `packages/api/src/router/skill.ts`: replace `category: z.string().optional()` in the list input with `category: ArtifactCategorySchema.optional()`; do the same in create and update inputs. Import `ArtifactCategorySchema` from `@curiouslycory/shared-types`
- [ ] In `packages/api/src/router/artifact.ts`: remove the local `artifactCategorySchema` declaration (line ~18) and import `ArtifactCategorySchema` from `@curiouslycory/shared-types`; use `.exclude(["skill"])` or define `ArtifactOnlyCategorySchema` in shared-types to get the `["agent", "prompt", "claudemd"]` subset
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-019: Improve API-layer error handling — disk-sync, config-sync, favorites
**Description:** As a web app user, I want to know when background sync operations fail so that I don't think my changes were saved when they weren't.

**Acceptance Criteria:**
- [ ] In `packages/api/src/lib/disk-sync.ts`: add `skipped: number` and `errors: string[]` fields to the return type of `syncSkillsFromDisk` and `syncArtifactsFromDisk`; in the `catch { continue }` blocks (lines ~74-76 and ~125-127), push the error message to the errors array and increment skipped count; log each skip with `console.warn`
- [ ] In `packages/api/src/lib/config-sync.ts`: in the `defaultAgents` JSON.parse catch (lines ~36-42), add a `console.warn` log about the parse failure
- [ ] In `packages/api/src/router/favorite.ts` and `packages/api/src/router/config.ts`: the fire-and-forget `syncConfigToFile(ctx.db).catch(...)` calls — at minimum ensure the catch logs enough context (file path, operation) to be debuggable. Optionally await the sync and include a `syncWarning` field in the response
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-020: Add DB CHECK constraints for category and type columns
**Description:** As a developer, I want the database to reject invalid category and type values so that the DB layer enforces the same enums as the application layer.

**Acceptance Criteria:**
- [ ] In `packages/db/src/schema.ts`: add a Drizzle `.check()` constraint on `skills.category` limiting it to `('skill', 'agent', 'prompt', 'claudemd')`. Use Drizzle's `check` from `drizzle-orm/sqlite-core`
- [ ] Add a `.check()` constraint on `favorites.type` limiting it to `('repo', 'skill')`
- [ ] If Drizzle's current version doesn't support `.check()` on SQLite, use raw SQL via `sql` template: add a comment documenting the intended constraint and create the CHECK via `db.run(sql\`...\`)` in the initialization code
- [ ] Run `drizzle-kit push` successfully (or document that existing DBs need migration)
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

### US-021: Fix FTS5 trigger design — use rowid-based matching
**Description:** As a developer, I want FTS5 triggers to use rowid-based matching so that updates and deletes are reliable even when skills share similar content.

**Acceptance Criteria:**
- [ ] In `packages/db/src/fts.ts`: convert to FTS5 external content table pattern — `CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(name, description, tags, content, content=skills, content_rowid=rowid)`. Note: SQLite tables always have an implicit `rowid` even with TEXT primary keys
- [ ] Update the INSERT trigger to use `INSERT INTO skills_fts(rowid, name, description, tags, content) VALUES (NEW.rowid, NEW.name, NEW.description, NEW.tags, NEW.content)`
- [ ] Update the UPDATE trigger DELETE to use `DELETE FROM skills_fts WHERE rowid = OLD.rowid` (replaces the fragile 4-column match)
- [ ] Update the DELETE trigger similarly: `DELETE FROM skills_fts WHERE rowid = OLD.rowid`
- [ ] In `packages/api/src/router/search.ts`: update the FTS JOIN from `s.name = skills_fts.name AND s.description = skills_fts.description` to `s.rowid = skills_fts.rowid`
- [ ] Test that search still works end-to-end after the change
- [ ] pnpm typecheck passes
- [ ] pnpm build passes

## Functional Requirements

- FR-1: The auth module must throw at startup when auth is enabled without a secret
- FR-2: All user-generated HTML must be sanitized before DOM insertion
- FR-3: The tRPC API must not accept cross-origin requests
- FR-4: All git read endpoints must respect the auth boundary
- FR-5: All Zod schemas must enforce real constraints (no bare `z.string()` for enums)
- FR-6: All `JSON.parse` calls on untrusted data must be wrapped in safe utilities
- FR-7: CLI commands must set non-zero exit codes on failure
- FR-8: Error handling must distinguish ENOENT from other filesystem errors
- FR-9: FTS5 triggers must use rowid-based matching

## Non-Goals

- No new features — this is purely a quality/security fix pass
- No test coverage improvements (separate PRD planned)
- No UI changes beyond the XSS sanitization
- No removal of the validators package (too disruptive; just document it)
- No changes to the adapter architecture or CLI command structure

## Technical Considerations

- When auth is disabled, `getSession()` returns `{ user: { username: "local" } }` so `protectedProcedure` passes automatically — no conditional logic needed
- SQLite tables always have an implicit `rowid` column, even with a TEXT primary key — the FTS5 external content pattern works
- Zod v4 supports `.exclude()` on enums for creating subsets (used in US-018)
- The `sourceToGitHub` extraction (US-010) should happen before the silent failure improvements (US-017) to avoid adding logging to code that will be moved

## Success Metrics

- Zero security findings on re-review
- All `JSON.parse` calls wrapped in safe utilities
- All catch blocks either distinguish ENOENT or log warnings
- CLI exits with code 1 on any failure
- All 21 stories pass `pnpm lint && pnpm typecheck && pnpm build`
