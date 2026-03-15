import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "animes.db");
const db = new Database(dbPath);

// Cria a tabela se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS animes_raw (
    id INTEGER PRIMARY KEY,
    title TEXT,
    origem TEXT,
    image TEXT
  );
`);

export default db;

const DB_PATH = path.join(process.cwd(), "data", "animes.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
      anilist_id     INTEGER PRIMARY KEY,
      mal_id         INTEGER UNIQUE,
      average_score  INTEGER,
      mean_score     INTEGER,
      cover_image    TEXT,
      description    TEXT,
      episodes       INTEGER,
      genres         TEXT,
      hashtag        TEXT,
      format         TEXT,
      season_year    INTEGER,
      season         TEXT,
      source         TEXT,
      start_year     INTEGER,
      type           TEXT,
      title_english  TEXT,
      title_native   TEXT,
      title_romaji   TEXT,
      title_preferred TEXT,
      tags           TEXT,
      synonyms       TEXT,
      studios        TEXT,
      popularity     INTEGER,
      relations      TEXT,
      raw            TEXT,
      fetched_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS not_found (
      mal_id     INTEGER PRIMARY KEY,
      checked_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mal    ON anime(mal_id);
    CREATE INDEX IF NOT EXISTS idx_format ON anime(format);
  `);
}

/**
 * Retorna todos os MAL IDs que já foram processados:
 * - os que estão no banco (anime)
 * - os que deram 404 (not_found)
 */
export function getProcessedMalIds(db: Database.Database): Set<number> {
  const fetched = db
    .prepare("SELECT mal_id FROM anime WHERE mal_id IS NOT NULL")
    .all() as { mal_id: number }[];

  const notFound = db
    .prepare("SELECT mal_id FROM not_found")
    .all() as { mal_id: number }[];

  const set = new Set<number>();
  for (const r of fetched) set.add(r.mal_id);
  for (const r of notFound) set.add(r.mal_id);
  return set;
}

export function getNotFoundCount(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM not_found")
    .get() as { count: number };
  return row.count;
}

export function buildInsertStmt(db: Database.Database) {
  return db.prepare(`
    INSERT OR REPLACE INTO anime (
      anilist_id, mal_id, average_score, mean_score,
      cover_image, description, episodes, genres,
      hashtag, format, season_year, season, source,
      start_year, type, title_english, title_native,
      title_romaji, title_preferred, tags, synonyms,
      studios, popularity, relations, raw
    ) VALUES (
      @anilist_id, @mal_id, @average_score, @mean_score,
      @cover_image, @description, @episodes, @genres,
      @hashtag, @format, @season_year, @season, @source,
      @start_year, @type, @title_english, @title_native,
      @title_romaji, @title_preferred, @tags, @synonyms,
      @studios, @popularity, @relations, @raw
    )
  `);
}

export function buildNotFoundStmt(db: Database.Database) {
  return db.prepare(`
    INSERT OR IGNORE INTO not_found (mal_id) VALUES (?)
  `);
}

export function mediaToRow(media: Record<string, any>) {
  const mainStudios = (media.studios?.edges ?? [])
    .filter((e: any) => e.isMain)
    .map((e: any) => e.node.name);

  return {
    anilist_id: media.id,
    mal_id: media.idMal ?? null,
    average_score: media.averageScore ?? null,
    mean_score: media.meanScore ?? null,
    cover_image: media.coverImage?.medium ?? null,
    description: media.description ?? null,
    episodes: media.episodes ?? null,
    genres: JSON.stringify(media.genres ?? []),
    hashtag: media.hashtag ?? null,
    format: media.format ?? null,
    season_year: media.seasonYear ?? null,
    season: media.season ?? null,
    source: media.source ?? null,
    start_year: media.startDate?.year ?? null,
    type: media.type ?? null,
    title_english: media.title?.english ?? null,
    title_native: media.title?.native ?? null,
    title_romaji: media.title?.romaji ?? null,
    title_preferred: media.title?.userPreferred ?? null,
    tags: JSON.stringify(media.tags ?? []),
    synonyms: JSON.stringify(media.synonyms ?? []),
    studios: JSON.stringify(mainStudios),
    popularity: media.popularity ?? null,
    relations: JSON.stringify(media.relations?.edges ?? []),
    raw: JSON.stringify(media),
  };
}

// ═══════════════════════════════════════════════════════
// Game queries (adicionar ao final do db.ts existente)
// ═══════════════════════════════════════════════════════

export function getRandomAnimeFromRaw(
  db: Database.Database
): { mal_id: number } | null {
  try {
    return (
      (db
        .prepare(
          `SELECT a.series_id as mal_id
           FROM animes_raw ar
           INNER JOIN anime a ON ar.id = a.mal_id
           ORDER BY RANDOM()
           LIMIT 1`
        )
        .get() as any) ?? null
    );
  } catch {
    return null;
  }
}

export function getAnimeByMalId(
  db: Database.Database,
  malId: number
): Record<string, any> | null {
  console.log(`SELECT * FROM anime WHERE mal_id = ${malId}`)
  return (
    (db.prepare("SELECT * FROM anime WHERE mal_id = ?").get(malId) as any) ??
    null
  );
}

export function searchAnimeByTitle(
  db: Database.Database,
  query: string,
  limit = 10
) {
  const pattern = `%${query}%`;
  return db
    .prepare(
      `SELECT mal_id, title_romaji, title_english, title_native, cover_image
       FROM anime
       WHERE mal_id IS NOT NULL
         AND (
           title_romaji  LIKE @pattern COLLATE NOCASE
           OR title_english LIKE @pattern COLLATE NOCASE
           OR title_native  LIKE @pattern
           OR synonyms      LIKE @pattern COLLATE NOCASE
         )
       LIMIT @limit`
    )
    .all({pattern, limit}) as any[];
}

export function getListOwners(
  db: Database.Database,
  malId: number
): string[] {
  try {
    const rows = db
      .prepare("SELECT DISTINCT origem FROM animes_raw WHERE id = ?")
      .all(malId) as { origem: string }[];
    return rows.map((r) => r.origem);
  } catch {
    return [];
  }
}

export function getCommonListOwners(
  db: Database.Database,
  malIdA: number,
  malIdB: number
): string[] {
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT a.origem
         FROM animes_raw a
         INNER JOIN animes_raw b ON a.origem = b.origem
         WHERE a.id = ? AND b.id = ?`
      )
      .all(malIdA, malIdB) as { origem: string }[];
    return rows.map((r) => r.origem);
  } catch {
    return [];
  }
}

export function getRandomAnimeByDifficulty(
  db: Database.Database,
  minPop: number,
  maxPop: number
): { mal_id: number } | null {
  try {
    return (
      (db
        .prepare(
          `SELECT ar.id as mal_id
           FROM animes_raw ar
           INNER JOIN anime a ON ar.id = a.mal_id
           WHERE a.popularity BETWEEN @minPop AND @maxPop
           ORDER BY RANDOM()
           LIMIT 1`
        )
        .get({ minPop, maxPop }) as any) ?? null
    );
  } catch {
    return null;
  }
}