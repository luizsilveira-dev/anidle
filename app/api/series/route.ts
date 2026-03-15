import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildSeries } from "@/lib/series";

export const dynamic = "force-dynamic";

// POST: processa as séries
export async function POST() {
  try {
    const start = Date.now();
    const result = buildSeries();
    const elapsed = Date.now() - start;

    return NextResponse.json({
      ...result,
      elapsed_ms: elapsed,
      message: `${result.groups} séries agrupadas, ${result.standalone} standalone, ${result.updated} atualizados em ${elapsed}ms`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// GET: status das séries
export async function GET() {
  const db = getDb();

  const columns = db
    .prepare("PRAGMA table_info(anime)")
    .all() as { name: string }[];

  if (!columns.some((c) => c.name === "series_id")) {
    return NextResponse.json({
      processed: false,
      message: "Séries ainda não processadas. POST /api/series pra rodar.",
    });
  }

  const stats = db
    .prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(series_id) as with_series,
        COUNT(DISTINCT series_id) as unique_series
      FROM anime
    `)
    .get() as { total: number; with_series: number; unique_series: number };

  const multiMember = db
    .prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT series_id FROM anime
        WHERE series_id IS NOT NULL
        GROUP BY series_id
        HAVING COUNT(*) > 1
      )
    `)
    .get() as { count: number };

  const largest = db
    .prepare(`
      SELECT
        series_id,
        COUNT(*) as size,
        MIN(title_romaji) as example_title
      FROM anime
      WHERE series_id IS NOT NULL
      GROUP BY series_id
      ORDER BY size DESC
      LIMIT 10
    `)
    .all() as { series_id: number; size: number; example_title: string }[];

  return NextResponse.json({
    processed: true,
    total: stats.total,
    withSeries: stats.with_series,
    uniqueSeries: stats.unique_series,
    multiMemberSeries: multiMember.count,
    standalone: stats.unique_series - multiMember.count,
    top10: largest,
  });
}