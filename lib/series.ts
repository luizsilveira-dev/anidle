import { getDb } from "./db";

/* ═══════════════════════════════════════════════════════
   Union-Find (Disjoint Set Union)
   ═══════════════════════════════════════════════════════ */

class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  add(x: number) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: number): number {
    if (!this.parent.has(x)) this.add(x);

    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }

    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }

    return root;
  }

  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;

    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  groups(): Map<number, number[]> {
    const result = new Map<number, number[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(x);
    }
    return result;
  }
}

/* ═══════════════════════════════════════════════════════
   Relation types que indicam "mesma série"
   ═══════════════════════════════════════════════════════ */

const SERIES_RELATIONS = new Set([
  "PREQUEL",
  "SEQUEL",
  "PARENT",
  "SIDE_STORY",
  "SPIN_OFF",
  "ALTERNATIVE",
  "SUMMARY",
]);

/* ═══════════════════════════════════════════════════════
   Processar séries
   ═══════════════════════════════════════════════════════ */

interface AnimeRow {
  anilist_id: number;
  mal_id: number | null;
  start_year: number | null;
  season_year: number | null;
  relations: string; // JSON
}

export function buildSeries(): {
  groups: number;
  updated: number;
  standalone: number;
} {
  const db = getDb();

  // ── Garante que a coluna existe ──
  const columns = db
    .prepare("PRAGMA table_info(anime)")
    .all() as { name: string }[];

  if (!columns.some((c) => c.name === "series_id")) {
    db.exec("ALTER TABLE anime ADD COLUMN series_id INTEGER");
    db.exec("CREATE INDEX IF NOT EXISTS idx_series ON anime(series_id)");
  }

  // ── Carrega todos os animes ──
  const rows = db
    .prepare(
      "SELECT anilist_id, mal_id, start_year, season_year, relations FROM anime"
    )
    .all() as AnimeRow[];

  // Mapa de anilist_id → row para lookup
  const byAnilistId = new Map<number, AnimeRow>();
  // Mapa de mal_id → anilist_id para resolver relações
  const malToAnilist = new Map<number, number>();

  for (const row of rows) {
    byAnilistId.set(row.anilist_id, row);
    if (row.mal_id) malToAnilist.set(row.mal_id, row.anilist_id);
  }

  // ── Construir Union-Find a partir das relações ──
  const uf = new UnionFind();

  for (const row of rows) {
    uf.add(row.anilist_id);

    let edges: any[] = [];
    try {
      edges = JSON.parse(row.relations || "[]");
    } catch {
      continue;
    }

    for (const edge of edges) {
      const relType: string = edge.relationType ?? "";

      if (!SERIES_RELATIONS.has(relType)) continue;

      // A relação aponta via idMal do node relacionado
      const relMalId: number | null = edge.node?.idMal ?? null;
      if (!relMalId) continue;

      // Resolve pra anilist_id (só se temos esse anime no banco)
      const relAnilistId = malToAnilist.get(relMalId);
      if (!relAnilistId) continue;

      uf.union(row.anilist_id, relAnilistId);
    }
  }

  // ── Para cada grupo, o series_id é o anime mais antigo ──
  const groups = uf.groups();

  // Mapeia anilist_id → series_id
  const seriesMap = new Map<number, number>();

  for (const [, members] of groups) {
    // Encontra o mais antigo do grupo
    let oldest: AnimeRow | null = null;
    let oldestYear = Infinity;

    for (const anilistId of members) {
      const row = byAnilistId.get(anilistId);
      if (!row) continue;

      const year = row.season_year ?? row.start_year ?? Infinity;
      if (year < oldestYear) {
        oldestYear = year;
        oldest = row;
      }
    }

    const seriesId = oldest?.anilist_id ?? members[0];

    for (const anilistId of members) {
      seriesMap.set(anilistId, seriesId);
    }
  }

  // ── Gravar no banco ──
  const update = db.prepare(
    "UPDATE anime SET series_id = ? WHERE anilist_id = ?"
  );

  const tx = db.transaction(() => {
    for (const [anilistId, seriesId] of seriesMap) {
      update.run(seriesId, anilistId);
    }
  });

  tx();

  // ── Stats ──
  let standalone = 0;
  let multiCount = 0;

  for (const [, members] of groups) {
    if (members.length === 1) standalone++;
    else multiCount++;
  }

  return {
    groups: multiCount,
    updated: seriesMap.size,
    standalone,
  };
}