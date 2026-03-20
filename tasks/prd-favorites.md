# PRD: Favorites

## Introduction

Add a first-class Favorites feature to my-skills, enabling users to bookmark repositories and individual skills for quick access, curation, and streamlined CLI workflows. Currently, a basic `favorites` table exists in the DB (repo-level only) with minimal CRUD in the `config` router, and the CLI stores `favoriteRepos` as a string array in `~/.my-skills/config.json`. This feature elevates favorites to a full entity with a dedicated web dashboard, data table, and deep CLI integration.

## Goals

- Allow users to favorite both full repositories and individual skills from a repo
- Provide a dedicated web dashboard at `/favorites` with stats, sortable/searchable data table, and pagination
- Add Favorites to the left nav sidebar for top-level visibility
- Persist sort, search, and filter state as URL search params so browser back/forward works
- Integrate favoriting into the CLI `add` command via a toggle in the skill picker and `--favorite` flag
- Surface favorite status in the CLI `list` command
- Provide a dedicated `ms favorite` CLI subcommand for managing favorites

## User Stories

### US-001: Evolve favorites database schema
**Description:** As a developer, I need the favorites table to support both repo-level and skill-level favorites so the feature can distinguish between the two.

**Acceptance Criteria:**
- [ ] Add `skillName` column (nullable text) to `favorites` table — null means whole repo
- [ ] Add `type` column (text, not null, default "repo") — values: "repo" or "skill"
- [ ] Replace existing `UNIQUE(repoUrl)` with composite unique on `(repoUrl, skillName)`
- [ ] Run `drizzle-kit push` successfully against existing data
- [ ] Typecheck/lint passes

### US-002: Add FavoriteType to shared types
**Description:** As a developer, I need shared Zod schemas for the favorite type enum so both web and CLI can validate consistently.

**Acceptance Criteria:**
- [ ] Add `FavoriteTypeSchema = z.enum(["repo", "skill"])` to `packages/shared-types/src/index.ts`
- [ ] Export the inferred `FavoriteType` type
- [ ] Typecheck/lint passes

### US-003: Create dedicated favorite tRPC router
**Description:** As a developer, I need a dedicated favorite router with pagination, search, sorting, stats, and CRUD so the web dashboard has a proper API to consume.

**Acceptance Criteria:**
- [ ] Create `packages/api/src/router/favorite.ts` with procedures:
  - `list` — paginated, searchable, sortable, filterable by type. Returns `{ items, totalCount }`
  - `stats` — returns `{ total, repoCount, skillCount, mostRecent, topRepos }`
  - `add` — insert with conflict handling, calls `syncConfigToFile`
  - `remove` — delete by id, calls `syncConfigToFile`
  - `toggle` — add if missing, remove if present, returns `{ favorited: boolean }`
  - `isFavorited` — quick boolean lookup by repoUrl + optional skillName
- [ ] Register `favorite: favoriteRouter` in `packages/api/src/root.ts`
- [ ] Remove `favorites` sub-object from `packages/api/src/router/config.ts`
- [ ] Update `syncConfigToFile` to only sync `type = "repo"` entries to `favoriteRepos` in config
- [ ] Typecheck/lint passes

### US-004: Add Favorites to sidebar navigation
**Description:** As a user, I want to see Favorites in the left nav so I can access my bookmarked items with one click.

**Acceptance Criteria:**
- [ ] Add `{ href: "/favorites", label: "Favorites", icon: StarFilledIcon }` to `navItems` in `sidebar.tsx`
- [ ] Positioned between Compositions and Git in the nav order
- [ ] Active state highlights correctly when on `/favorites` route
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-005: Create favorites page with stats dashboard
**Description:** As a user, I want a clean dashboard at `/favorites` showing key stats like total favorites and a breakdown of repos vs skills.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/(dashboard)/favorites/page.tsx` as server component
- [ ] Prefetch `trpc.favorite.stats` and `trpc.favorite.list` on server
- [ ] Create `apps/web/src/app/_components/favorite-stats.tsx` displaying stat cards:
  - Total favorites count
  - Repos count
  - Skills count
  - Most recently added favorite (name + relative time)
- [ ] Include skeleton loading state for stats
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-006: Create reusable DataTable component
**Description:** As a developer, I need a reusable data table component built on shadcn/ui + @tanstack/react-table so the favorites list (and future tables) have sorting, filtering, and pagination out of the box.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/_components/data-table.tsx` following the [shadcn/ui data table pattern](https://ui.shadcn.com/docs/components/data-table)
- [ ] Wraps `@tanstack/react-table` (already in `apps/web` dependencies) with shadcn `Table` components from `@curiouslycory/ui/table`
- [ ] Accepts `columns: ColumnDef<T>[]` and `data: T[]` props
- [ ] Supports sortable column headers with visual sort indicators
- [ ] Supports pagination controls (Previous/Next, page X of Y)
- [ ] Typecheck/lint passes

### US-007: Build favorites data table with URL state
**Description:** As a user, I want to browse my favorites in a sortable, searchable, paginated data table where my current view is preserved in the URL so I can use browser back/forward.

**Acceptance Criteria:**
- [ ] Create `apps/web/src/app/_components/favorite-list.tsx` using the DataTable component
- [ ] Columns: Name, Type (badge: "Repo"/"Skill"), Repo URL, Skill Name (if applicable), Added date, Actions (remove)
- [ ] Debounced search input filters favorites by name/repo
- [ ] Type filter buttons: All / Repos / Skills
- [ ] Sortable by Name, Type, Added date via column header clicks
- [ ] Server-side pagination at 30 items per page
- [ ] URL search params: `search`, `sort`, `order`, `page`, `type` — all synced bidirectionally
- [ ] Browser back/forward correctly restores previous view state
- [ ] Remove action shows AlertDialog confirmation before deleting
- [ ] Empty state card when no favorites exist
- [ ] Skeleton loading state
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-008: Add favorite toggle to CLI add command
**Description:** As a CLI user, I want to mark a skill as a favorite during the install process — either via the interactive picker or a `--favorite` flag — so I don't need a separate step.

**Acceptance Criteria:**
- [ ] Add `-f, --favorite` flag to the `add` command
- [ ] In the interactive skill picker (checkbox), add a "favorite" toggle indicator for each skill/repo
- [ ] When `--favorite` flag is used with a direct skill source (`ms add owner/repo/skill -f`), automatically favorite the repo
- [ ] Favoriting writes to `config.favoriteRepos` via `loadConfig`/`saveConfig`
- [ ] Does not prompt or favorite when `--yes` is used (unless `--favorite` is also present)
- [ ] Typecheck/lint passes

### US-009: Show favorite status in CLI list command
**Description:** As a CLI user, I want to see which of my installed skills come from favorited repos so I can quickly identify my preferred sources.

**Acceptance Criteria:**
- [ ] Add a star indicator column to the `ms list` table output for skills from favorited repos
- [ ] Load favorites from config via `loadConfig()` and check each skill's source
- [ ] Add `--favorites` flag to filter list to only skills from favorited repos
- [ ] Typecheck/lint passes

### US-010: Create dedicated CLI favorite subcommand
**Description:** As a CLI user, I want to manage my favorites directly via `ms favorite add/remove/list` without needing the web UI.

**Acceptance Criteria:**
- [ ] Create `apps/cli/src/commands/favorite.ts` with subcommands:
  - `ms favorite add <owner/repo>` — adds repo to `config.favoriteRepos`
  - `ms favorite remove <owner/repo>` — removes from `favoriteRepos`
  - `ms favorite list` — prints table of favorited repos
- [ ] Register in `apps/cli/src/program.ts`
- [ ] Typecheck/lint passes

### US-011: Update CLI documentation
**Description:** As a user reading the CLI README, I want to see the new favorite commands documented so I know how to use them.

**Acceptance Criteria:**
- [ ] Add `ms favorite add/remove/list` to CLI Reference table in `apps/cli/README.md`
- [ ] Add `--favorite` / `-f` flag to the `ms add` row
- [ ] Add `--favorites` flag to the `ms list` row
- [ ] Add an example showing the favorite workflow
- [ ] No broken markdown links or formatting issues

## Functional Requirements

- FR-1: The `favorites` table must support both repo-level favorites (`skillName = NULL, type = "repo"`) and skill-level favorites (`skillName = "skill-name", type = "skill"`)
- FR-2: The composite unique constraint on `(repoUrl, skillName)` must prevent duplicate favorites
- FR-3: The `favorite.list` API must accept `page`, `pageSize`, `search`, `sortBy`, `sortOrder`, and `type` parameters and return `{ items, totalCount }`
- FR-4: The `favorite.stats` API must return total count, repo/skill breakdown, most recent favorite, and top repos by skill count
- FR-5: The Favorites page must be accessible from the left sidebar navigation
- FR-6: All table state (search query, sort column/direction, current page, type filter) must be persisted in URL search params
- FR-7: Pagination must occur at 30-item intervals with server-side offset/limit
- FR-8: The CLI `add` command must support a `-f`/`--favorite` flag and a toggle in the interactive picker
- FR-9: The CLI `list` command must show a star indicator for skills from favorited repos
- FR-10: The `syncConfigToFile` function must only sync repo-type favorites (not skill-type) to `favoriteRepos` in the config JSON
- FR-11: The reusable DataTable component must follow the shadcn/ui data table pattern built on `@tanstack/react-table`

## Non-Goals

- No import/export of favorites lists
- No sharing favorites with other users
- No favorite categories or tags
- No favorite ordering/ranking (beyond sort)
- No notifications when favorited repos update
- No auto-favoriting based on usage patterns
- No web-based add/create favorites form in this iteration (only remove via table; add happens through CLI or future skill detail pages)

## Design Considerations

- **Sidebar icon**: Use `StarFilledIcon` from `@radix-ui/react-icons`
- **Stats cards**: Reuse existing `Card` component from `@curiouslycory/ui/card`
- **Data table**: Build reusable `DataTable` on shadcn/ui data table pattern (`@tanstack/react-table`) — reference [shadcn docs](https://ui.shadcn.com/docs/components/data-table) during implementation
- **Type badges**: Reuse `Badge` component with "secondary" variant for "Repo" and "outline" variant for "Skill"
- **Delete confirmation**: Reuse `AlertDialog` pattern from `composition-list.tsx`
- **Search input**: Reuse debounce pattern from `search-results.tsx`
- **URL state**: Follow `useSearchParams` + `router.replace()` pattern from `search-results.tsx`
- **Skeleton loading**: Follow pulse animation pattern from existing list skeletons

## Technical Considerations

- **SQLite NULL in composite unique**: SQLite treats each NULL as distinct in unique constraints, so multiple rows with the same `repoUrl` and `skillName = NULL` would be allowed. The `add` procedure must check for existing entries before inserting (upsert pattern or explicit existence check).
- **Schema evolution**: `drizzle-kit push` handles SQLite constraint changes via table recreation. Test with existing data to ensure no data loss.
- **Config sync**: The `syncConfigToFile` function must filter to `type = "repo"` to maintain backward compatibility with CLI's `loadConfig()` which reads `favoriteRepos` as a string array.
- **Existing dependencies**: `@tanstack/react-table` is already in `apps/web/package.json`. No new dependencies needed.
- **tRPC router extraction**: Moving favorites from `config.favorites.*` to `favorite.*` is a breaking change for any existing callers. The web app's tRPC calls must be updated accordingly.

## Success Metrics

- Favorites page loads in under 1 second with 100+ favorites
- URL state roundtrips correctly (change filter -> back -> forward preserves state)
- CLI `ms add owner/repo/skill -f` favorites the repo in a single command
- All existing tests continue to pass
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass cleanly

## Open Questions

- Should skill detail pages (web) have a "favorite" button? (Deferred to future iteration)
- Should `ms favorite add` support skill-level favorites (`ms favorite add owner/repo/skill-name`) or only repo-level?
- Should the stats dashboard show a "favorites over time" trend? (Likely overkill for v1)
