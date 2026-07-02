import type { SQL } from "drizzle-orm";
import { and, desc, eq, sql } from "drizzle-orm";

import { skills } from "./schema";
import type { Database, DbDialect } from "./types";
import { resolveDialect } from "./types";

/**
 * Parameters accepted by {@link searchSkills}. `limit` and `offset` are required
 * (the caller supplies validated defaults).
 */
export interface SearchSkillsParams {
  query?: string;
  category?: string;
  limit: number;
  offset: number;
  /**
   * When provided, results are scoped to skills owned by this user. The tRPC
   * search router always supplies `ctx.session.user.id`; the parameter stays
   * optional so the low-level util (and its dialect unit tests) remain usable
   * without a user context.
   */
  userId?: string;
}

/**
 * A single search hit. Shape is identical across dialects so callers (and the
 * tRPC search router) stay dialect-agnostic. `snippet` is `null` for the
 * recent-items (empty query) path and a highlighted excerpt for text matches.
 */
export interface SkillSearchResult {
  id: string;
  name: string;
  description: string;
  tags: string;
  author: string | null;
  version: string | null;
  content: string;
  dirPath: string | null;
  category: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  snippet: string | null;
}

/** Row returned by the SQLite FTS5 raw query. */
interface SqliteFtsRow {
  id: string;
  name: string;
  description: string;
  tags: string;
  author: string | null;
  version: string | null;
  content: string;
  dir_path: string | null;
  category: string | null;
  created_at: number;
  updated_at: number;
  snippet: string;
}

/** Row returned by the Postgres tsvector raw query. */
interface PgSearchRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  tags: string;
  author: string | null;
  version: string | null;
  content: string;
  dir_path: string | null;
  category: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  snippet: string | null;
}

/** Minimal surface of the neon-http client used for the Postgres search path. */
interface PgExecutor {
  execute<TRow extends Record<string, unknown>>(
    query: SQL,
  ): Promise<{ rows: TRow[] }>;
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Dialect-agnostic skill search.
 *
 * - Empty query: returns recent items via the portable drizzle query builder.
 * - SQLite: uses the FTS5 virtual table (`skills_fts`) with `MATCH` + `snippet`.
 * - Postgres: uses `to_tsvector`/`to_tsquery` with `ts_rank` ordering and
 *   `ts_headline` for the highlighted snippet.
 *
 * The FTS5 internals stay SQLite-only; the Postgres equivalent lives here so the
 * search router never has to branch on dialect.
 */
export async function searchSkills(
  db: Database,
  params: SearchSkillsParams,
  dialect: DbDialect = resolveDialect(),
): Promise<SkillSearchResult[]> {
  const { query, category, limit, offset, userId } = params;

  // Empty query: return recent items (portable across dialects).
  if (!query || query.trim() === "") {
    const conditions = [
      category ? eq(skills.category, category) : undefined,
      userId ? eq(skills.userId, userId) : undefined,
    ].filter((c): c is SQL => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(skills)
      .where(where)
      .orderBy(desc(skills.updatedAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({ ...row, snippet: null }));
  }

  if (dialect === "postgres") {
    return searchSkillsPostgres(db, query, category, limit, offset, userId);
  }

  return searchSkillsSqlite(db, query, category, limit, offset, userId);
}

function searchSkillsSqlite(
  db: Database,
  query: string,
  category: string | undefined,
  limit: number,
  offset: number,
  userId: string | undefined,
): SkillSearchResult[] {
  // Build FTS5 MATCH query with prefix matching.
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" ");

  const categoryFilter = category ? sql`AND s.category = ${category}` : sql``;
  // The FTS join can match multiple skill rows with identical name/description
  // across users; scoping by user_id both filters results and prevents leakage.
  const userFilter = userId ? sql`AND s.user_id = ${userId}` : sql``;

  const results = db.all<SqliteFtsRow>(sql`
    SELECT
      s.id, s.name, s.description, s.tags, s.author, s.version,
      s.content, s.dir_path, s.category, s.created_at, s.updated_at,
      snippet(skills_fts, -1, '<mark>', '</mark>', '...', 48) as snippet,
      rank
    FROM skills_fts
    JOIN skills s ON s.name = skills_fts.name
      AND s.description = skills_fts.description
    WHERE skills_fts MATCH ${terms}
    ${categoryFilter}
    ${userFilter}
    ORDER BY rank
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    author: row.author,
    version: row.version,
    content: row.content,
    dirPath: row.dir_path,
    category: row.category,
    createdAt: row.created_at ? new Date(row.created_at * 1000) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at * 1000) : null,
    snippet: row.snippet,
  }));
}

async function searchSkillsPostgres(
  db: Database,
  query: string,
  category: string | undefined,
  limit: number,
  offset: number,
  userId: string | undefined,
): Promise<SkillSearchResult[]> {
  // Normalize into a prefix tsquery: strip tsquery operators from each term and
  // append `:*` for prefix matching (parity with the SQLite FTS `*` behavior).
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((term) => term.length > 0)
    .map((term) => `${term}:*`);

  // Query was all punctuation/whitespace: no meaningful terms to match.
  if (terms.length === 0) return [];

  const tsQueryString = terms.join(" & ");

  const document = sql`(
    setweight(to_tsvector('english', coalesce(${skills.name}, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(${skills.description}, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(${skills.tags}, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(${skills.content}, '')), 'D')
  )`;
  const tsQuery = sql`to_tsquery('english', ${tsQueryString})`;
  const headlineDoc = sql`concat_ws(' ', ${skills.name}, ${skills.description}, ${skills.content})`;
  const categoryFilter = category
    ? sql`AND ${skills.category} = ${category}`
    : sql``;
  const userFilter = userId ? sql`AND ${skills.userId} = ${userId}` : sql``;

  const executor = db as unknown as PgExecutor;
  const { rows } = await executor.execute<PgSearchRow>(sql`
    SELECT
      ${skills.id} AS id,
      ${skills.name} AS name,
      ${skills.description} AS description,
      ${skills.tags} AS tags,
      ${skills.author} AS author,
      ${skills.version} AS version,
      ${skills.content} AS content,
      ${skills.dirPath} AS dir_path,
      ${skills.category} AS category,
      ${skills.createdAt} AS created_at,
      ${skills.updatedAt} AS updated_at,
      ts_headline('english', ${headlineDoc}, ${tsQuery}, 'StartSel=<mark>, StopSel=</mark>, MaxWords=48, MinWords=1, HighlightAll=FALSE') AS snippet
    FROM ${skills}
    WHERE ${document} @@ ${tsQuery}
    ${categoryFilter}
    ${userFilter}
    ORDER BY ts_rank(${document}, ${tsQuery}) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    author: row.author,
    version: row.version,
    content: row.content,
    dirPath: row.dir_path,
    category: row.category,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    snippet: row.snippet,
  }));
}
