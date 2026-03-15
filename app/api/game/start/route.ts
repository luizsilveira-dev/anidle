import { NextResponse } from "next/server";
import { getDb, getRandomAnimeByDifficulty } from "@/lib/db";
import {
  createSession,
  MAX_ATTEMPTS,
  DIFFICULTY_RANGES,
  type Difficulty,
} from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const difficulty: Difficulty =
    body.difficulty && body.difficulty in DIFFICULTY_RANGES
      ? body.difficulty
      : "easy";

  const range = DIFFICULTY_RANGES[difficulty];
  const db = getDb();
  const pick = getRandomAnimeByDifficulty(db, range.min, range.max);

  if (!pick) {
    return NextResponse.json(
      {
        error: `Nenhum anime encontrado para dificuldade "${range.label}". Verifique se o banco está populado.`,
      },
      { status: 404 }
    );
  }

  const gameId = createSession(pick.mal_id, difficulty);

  return NextResponse.json({
    gameId,
    maxAttempts: MAX_ATTEMPTS,
    difficulty,
    difficultyLabel: range.label,
    difficultyEmoji: range.emoji,
  });
}