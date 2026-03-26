# Plan: Comprehensive Test Coverage via Ralph PRD

## Context

The code review identified significant test coverage gaps across the monorepo. The CLI has 20 test files but ~40% flag coverage and 7 untested source files. The API has 1 test file (merge.ts only). The web app has zero tests. This plan creates a Ralph PRD with 25 user stories (~220-280 new tests) to close these gaps while protecting long-term package boundaries.

## Key Decisions

- **Testing library for web:** `@testing-library/react` with vitest + jsdom. Keep Playwright out-of-scope for now, but include a small page-level integration safety net.
- **CLI test pattern:** Real filesystem with temp dirs where possible (matching existing adapter tests), mocks for git/network.
- **API test pattern:** In-memory SQLite via `better-sqlite3(:memory:)` + drizzle schema push for router integration tests, with an explicit fallback path if harness setup fails.
- **Story sizing:** Keep stories implementation-sized, but split high-risk infrastructure into spike + hardening phases.
- **Boundary protection:** Add explicit contract tests across shared-types and API payload surfaces to prevent cross-package drift.
- **shared-types needs vitest config added** — US-001 includes this infrastructure.

## Quality Gates (Definition of Done)

### Coverage SLOs (initial baseline)

| Package                 | Line   | Branch | Function |
| ----------------------- | ------ | ------ | -------- |
| `packages/cli`          | >= 70% | >= 65% | >= 75%   |
| `packages/api`          | >= 75% | >= 70% | >= 80%   |
| `apps/web`              | >= 60% | >= 55% | >= 65%   |
| `packages/shared-types` | >= 90% | >= 85% | >= 90%   |

### Critical-path must-cover checks

1. CLI flag parsing and error handling (`add`, `remove`, `update`, `list`, `check`)
2. API router validation + malformed payload handling
3. Data migration and manifest rollback/error paths
4. Cross-package schema/type compatibility (`shared-types` and API responses)

## Story Overview (25 stories)

### Tier 1 — Shared Packages + Contracts

| #   | Story                                                     | Files                                                                           | Est. Tests |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 1   | shared-types frontmatter tests                            | `packages/shared-types/src/__tests__/frontmatter.test.ts` (new + vitest config) | 12-15      |
| 2   | shared-types contract tests consumed by CLI + web parsing | `packages/shared-types/src/__tests__/contract-frontmatter.test.ts` (new)        | 8-10       |

### Tier 2 — CLI Core

| #   | Story                                 | Files                                                                                     | Est. Tests |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| 3   | skill-resolver + sourceToGitHub tests | `tests/core/skill-resolver.test.ts` (new) + extend `tests/services/source-parser.test.ts` | 12-15      |
| 4   | skill-installer tests                 | `tests/core/skill-installer.test.ts` (new)                                                | 6-8        |
| 5   | cache service tests (mock git)        | `tests/services/cache.test.ts` (new)                                                      | 15-18      |
| 6   | manifest error path tests             | extend `tests/core/manifest.test.ts`                                                      | 6-8        |
| 7   | migration error path tests            | extend `tests/core/migration.test.ts`                                                     | 4-6        |

### Tier 3 — CLI Commands

| #   | Story                                                                                                  | Files                                    | Est. Tests |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------- |
| 8   | add: restoreFromManifest depth + installSingleSkill errors                                             | extend `tests/commands/add.test.ts`      | 8-10       |
| 9   | add: flag tests (`--all`, `--skill`, `--agent`, `--favorite`, `--list`, `--global`, `--copy`, `--yes`) | `tests/commands/add-flags.test.ts` (new) | 10-12      |
| 10  | remove: flag tests (`--skill`, `--yes`, `--global`, `--all`)                                           | extend `tests/commands/remove.test.ts`   | 8-10       |
| 11  | update: single skill name + error paths                                                                | extend `tests/commands/update.test.ts`   | 8-10       |
| 12  | list: `--interactive` + `scanSkillsDir` error handling                                                 | extend `tests/commands/list.test.ts`     | 8-10       |
| 13  | check: error type distinction in `checkSingleSkill`                                                    | extend `tests/commands/check.test.ts`    | 6-8        |

### Tier 4 — CLI Adapters + Entry Point

| #   | Story                                | Files                                   | Est. Tests |
| --- | ------------------------------------ | --------------------------------------- | ---------- |
| 14  | registry + index + entry point tests | `tests/adapters/registry.test.ts` (new) | 10-12      |

### Tier 5 — API

| #   | Story                                                  | Files                                                                               | Est. Tests |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| 15  | safe-json tests                                        | `packages/api/src/lib/__tests__/safe-json.test.ts` (new)                            | 8-10       |
| 16  | API test harness spike (SQLite + drizzle + caller POC) | `packages/api/src/test-utils.ts` (new, minimal) + spike test                        | 4-6        |
| 17  | API test harness hardening + favorite router tests     | harden `packages/api/src/test-utils.ts` + `router/__tests__/favorite.test.ts` (new) | 12-15      |
| 18  | skill + artifact + composition router tests            | `router/__tests__/skill.test.ts` + `router/__tests__/composition.test.ts` (new)     | 20-25      |
| 19  | disk-sync + config-sync tests                          | `lib/__tests__/disk-sync.test.ts` + `lib/__tests__/config-sync.test.ts` (new)       | 12-15      |
| 20  | search router tests (requires FTS5)                    | `router/__tests__/search.test.ts` (new)                                             | 8-10       |
| 21  | API response contract tests (schema-stable outputs)    | `router/__tests__/contracts.test.ts` (new)                                          | 8-12       |

### Tier 6 — Web App

| #   | Story                                                   | Files                                                                                | Est. Tests |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| 22  | Web test infrastructure setup                           | `apps/web/vitest.config.ts`, `src/test-utils.tsx`, smoke test (new)                  | 1          |
| 23  | SearchResults component tests                           | `__tests__/search-results.test.tsx` (new)                                            | 10-12      |
| 24  | FavoriteList component tests                            | `__tests__/favorite-list.test.tsx` (new)                                             | 8-10       |
| 25  | SkillList component tests + page-level integration path | `__tests__/skill-list.test.tsx` + `__tests__/search-page.integration.test.tsx` (new) | 10-14      |

**Total: ~220-280 new tests across 25 Ralph iterations**

## Dependency Chain

```
US-001-002 (shared-types + contracts) ──┐
                                        ├──> US-003-007 (CLI core) ──> US-008-013 (CLI commands) ──> US-014 (registry)
                                        │
                                        └──> US-015 (safe-json) ──> US-016 (API harness spike) ──> US-017 (hardened harness + favorite) ──> US-018-021 (API routers + contracts)

US-022 (web infra) ──> US-023-025 (web components + integration)
```

## Risks and Mitigations

1. **US-001** needs vitest config added to shared-types package (no test infra exists)  
   **Mitigation:** Add minimal local vitest config and baseline test command before expanding cases.
2. **US-005** (cache) requires mocking `@curiouslycory/git-service` GitService class (clone/fetch/resetHard)  
   **Mitigation:** Centralize GitService mock factory to avoid copy-paste drift and flaky behavior.
3. **US-016/017** API harness is foundational  
   **Mitigation:** Split spike vs hardening. If in-memory setup fails, fallback to ephemeral file-backed SQLite in temp dir.
4. **US-020** requires FTS5 setup  
   **Mitigation:** Create/search virtual table in explicit test setup helper; skip with clear reason only if environment lacks FTS5.
5. **US-022** requires Next.js App Router mocking (`next/navigation`)  
   **Mitigation:** Shared router mock helper in web `test-utils`.
6. **Cross-package schema drift risk** (CLI/API/Web)  
   **Mitigation:** US-002 and US-021 contract tests become required checks in CI.

## CI Enforcement and Test Operations

1. Required CI checks on every PR:
   - `pnpm lint`
   - `pnpm typecheck`
   - impacted package tests (`pnpm --filter <package> test`)
   - coverage report artifact with threshold enforcement
2. Flaky test policy:
   - Failing flaky test gets quarantine tag + tracking issue in same PR
   - Quarantined tests must be fixed or removed within one sprint
3. Coverage ratchet:
   - Never decrease package thresholds after baseline is established
   - Raise thresholds in small increments as stories land

## Test Data and Fixture Strategy

1. Use deterministic factory/builders per package (`id`, timestamps, and paths seeded).
2. Keep fixtures local to package boundaries; do not share mutable fixtures across CLI/API/Web.
3. Centralize setup/teardown helpers to guarantee clean state between tests.
4. Prefer explicit data builders over large static JSON fixture blobs.

## Deliverables

1. `tasks/prd-test-coverage.md` — Human-readable PRD
2. `.agents/skills/ralph/scripts/prd.json` — Ralph format, branch `feat/test-coverage`
3. `.agents/skills/ralph/scripts/progress.txt` — Fresh with codebase patterns

## Verification

Each story:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm --filter <package> test`

Periodic milestone verification (every 5 stories and before final handoff):

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm build`
