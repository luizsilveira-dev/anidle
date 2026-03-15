import { NextResponse } from "next/server";
import { getDb, searchAnimeByTitle } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) return NextResponse.json({ results: [] });

  const db = getDb();
  const rows = searchAnimeByTitle(db, q, 12);

  return NextResponse.json({
    results: rows.map((r) => ({
      malId: r.mal_id,
      titleRomaji: r.title_romaji,
      titleEnglish: r.title_english,
      coverImage: r.cover_image,
    })),
  });
}