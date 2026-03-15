import { NextResponse } from "next/server";
import { getDb, getAnimeByMalId } from "@/lib/db";
import {
  getSession,
  useBlurHint,
  canUseBlurHint,
  gameState,
  remaining,
} from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { gameId, type } = await request.json();

  if (!gameId)
    return NextResponse.json({ error: "gameId obrigatório" }, { status: 400 });

  const session = getSession(gameId);
  if (!session)
    return NextResponse.json({ error: "Sessão expirada" }, { status: 404 });

  if (type === "blur") {
    if (!canUseBlurHint(session)) {
      return NextResponse.json(
        {
          error: `Dica indisponível. Precisa de ${5 - session.attemptsUsed > 0 ? `mais ${5 - session.attemptsUsed} chutes` : `${10 - remaining(session)} tentativas a mais`}.`,
        },
        { status: 400 }
      );
    }

    const db = getDb();
    const secret = getAnimeByMalId(db, session.secretMalId);
    if (!secret)
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });

    useBlurHint(session);

    return NextResponse.json({
      blurImage: secret.cover_image,
      gameState: gameState(session),
    });
  }

  return NextResponse.json({ error: "Tipo de dica inválido" }, { status: 400 });
}