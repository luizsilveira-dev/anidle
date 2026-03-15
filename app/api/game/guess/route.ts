import { NextResponse } from "next/server";
import { getDb, getAnimeByMalId, getListOwners } from "@/lib/db";
import {
  getSession,
  deleteSession,
  useAttempt,
  remaining as rem,
  getLetterHint,
  gameState,
} from "@/lib/game";

export const dynamic = "force-dynamic";

function topTags(json: string, n = 5): string[] {
  try {
    return (JSON.parse(json || "[]") as any[])
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, n)
      .map((t) => t.name);
  } catch {
    return [];
  }
}

function allTagNames(json: string): Set<string> {
  try {
    return new Set((JSON.parse(json || "[]") as any[]).map((t) => t.name));
  } catch {
    return new Set();
  }
}

function parseStudios(json: string): string[] {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}

function dir(
  guess: number | null,
  secret: number | null
): "correct" | "higher" | "lower" | null {
  if (guess == null || secret == null) return null;
  if (guess === secret) return "correct";
  // "higher" = o secreto é MAIOR que o chute
  return guess < secret ? "higher" : "lower";
}

function formatAnime(row: any) {
  return {
    malId: row.mal_id,
    title: row.title_romaji ?? row.title_english ?? "?",
    coverImage: row.cover_image,
    year: row.season_year ?? row.start_year,
    studio: parseStudios(row.studios)[0] ?? "?",
    source: row.source ?? "?",
    score: row.mean_score,
    format: row.format ?? "?",
    tags: topTags(row.tags),
  };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { gameId, malId, giveUp } = body;

  if (!gameId)
    return NextResponse.json({ error: "gameId obrigatório" }, { status: 400 });

  const session = getSession(gameId);
  if (!session)
    return NextResponse.json({ error: "Sessão expirada" }, { status: 404 });

  const db = getDb();
  const secretRow = getAnimeByMalId(db, session.secretMalId);
  if (!secretRow)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });

  // ── Desistir ──
  if (giveUp) {
    deleteSession(gameId);
    return NextResponse.json({
      gaveUp: true,
      secret: formatAnime(secretRow),
      secretOwners: getListOwners(db, session.secretMalId),
    });
  }

  // ── Validações ──
  if (!malId)
    return NextResponse.json({ error: "malId obrigatório" }, { status: 400 });

  if (rem(session) <= 0) {
    deleteSession(gameId);
    return NextResponse.json({
      gameOver: true,
      won: false,
      secret: formatAnime(secretRow),
      secretOwners: getListOwners(db, session.secretMalId),
    });
  }

  if (session.guessedMalIds.has(malId)) {
    return NextResponse.json(
      { error: "Você já chutou esse anime!" },
      { status: 409 }
    );
  }

  const guessRow = getAnimeByMalId(db, malId);
  if (!guessRow)
    return NextResponse.json(
      { error: "Anime não encontrado" },
      { status: 404 }
    );

  // ── Registrar tentativa ──
  useAttempt(session, malId);

  const correct = malId === session.secretMalId;

  // ── Comparações ──
  const guessYear = guessRow.season_year ?? guessRow.start_year;
  const secretYear = secretRow.season_year ?? secretRow.start_year;

  const gStudios = parseStudios(guessRow.studios);
  const sStudios = parseStudios(secretRow.studios);
  const studioMatch = gStudios.some((s: string) => sStudios.includes(s));

  const gTags = topTags(guessRow.tags);
  const sTags = allTagNames(secretRow.tags);
  const matchTags = gTags.filter((t) => sTags.has(t));

  // ── Comparação de listas ──
  const guessOwners = getListOwners(db, malId);
  const secretOwners = getListOwners(db, session.secretMalId);
  const guessOwnerSet = new Set(guessOwners);
  const secretOwnerSet = new Set(secretOwners);
  const matchingOwners = guessOwners.filter((o) => secretOwnerSet.has(o));
  const exactListMatch = setsEqual(guessOwnerSet, secretOwnerSet);

  // ── Letter hint (auto quando remaining = 1) ──
  const remainingNow = rem(session);
  let letterHint = null;
  if (!correct && remainingNow <= 1) {
    const title = secretRow.title_romaji ?? secretRow.title_english ?? "";
    letterHint = getLetterHint(session, title);
  }

  // ── Game over? ──
  const gameOver = correct || remainingNow <= 0;

  if (gameOver) {
    deleteSession(gameId);
  }

  return NextResponse.json({
    guess: formatAnime(guessRow),
    hints: {
      year: dir(guessYear, secretYear),
      studio: studioMatch,
      source: (guessRow.source ?? "") === (secretRow.source ?? ""),
      score: dir(guessRow.mean_score, secretRow.mean_score),
      format: (guessRow.format ?? "") === (secretRow.format ?? ""),
      tags: matchTags,
    },
    list: {
      owners: guessOwners,
      matching: matchingOwners,
      exactMatch: exactListMatch,
      secretOwnerCount: secretOwners.length,
    },
    correct,
    gameOver,
    gameState: gameState(session),
    letterHint,
    // Se game over sem acertar, revela o secreto
    ...(!correct && gameOver
      ? {
          secret: formatAnime(secretRow),
          secretOwners,
        }
      : {}),
  });
}