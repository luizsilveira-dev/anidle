import { NextResponse } from "next/server";
import {
  getDb,
  getProcessedMalIds,
  getNotFoundCount,
  buildInsertStmt,
  buildNotFoundStmt,
  mediaToRow,
} from "@/lib/db";
import { fetchAnime, RateLimiter } from "@/lib/AniListClient";
import { extractMalIds } from "@/lib/jsonl";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════
   Singleton lock — impede dois syncs simultâneos
   (variável em memória do processo Node)
   ═══════════════════════════════════════════════════════ */

let syncRunning = false;

// ─── POST ───

export async function POST(request: Request) {
  // ── Bloqueia se já tem sync rodando ──
  if (syncRunning) {
    return NextResponse.json(
      { error: "Sync já em andamento. Aguarde ou reinicie o servidor." },
      { status: 409 }
    );
  }

  syncRunning = true;

  // ── AbortSignal: dispara quando o cliente desconecta ──
  const signal = request.signal;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // cliente já desconectou, enqueue falha — ignora
        }
      };

      try {
        const db = getDb();
        const limiter = new RateLimiter();
        const processed = getProcessedMalIds(db);
        const allIds = extractMalIds();
        const pending = allIds.filter((id) => !processed.has(id));

        send({
          event: "start",
          total: allIds.length,
          cached: processed.size,
          pending: pending.length,
        });

        if (pending.length === 0) {
          send({ event: "done", message: "Nada pra fazer." });
          controller.close();
          return;
        }

        const insert = buildInsertStmt(db);
        const insertNotFound = buildNotFoundStmt(db);
        const startTime = Date.now();
        let ok = 0;
        let skip = 0;
        let fail = 0;
        let streak = 0;
        let lastTitle = "";
        let aborted = false;

        for (const malId of pending) {
          // ── Checar se o cliente desconectou ──
          if (signal.aborted) {
            send({
              event: "abort",
              reason: "Cliente desconectou",
              ok,
              skip,
              fail,
            });
            aborted = true;
            console.log(
              `[sync] Cliente desconectou. Parando. ok=${ok} skip=${skip} fail=${fail}`
            );
            break;
          }

          try {
            const media = await fetchAnime(malId, limiter, 3, signal);

            if (!media) {
              insertNotFound.run(malId);
              skip++;
              streak = 0;
              send({ event: "skip", malId });
            } else {
              insert.run(mediaToRow(media));
              ok++;
              streak = 0;
              lastTitle = media.title?.romaji ?? `MAL#${malId}`;
            }
          } catch (err: any) {
            // Se o erro é por abort, para limpo
            if (signal.aborted || err.name === "AbortError") {
              send({
                event: "abort",
                reason: "Cliente desconectou",
                ok,
                skip,
                fail,
              });
              aborted = true;
              break;
            }

            fail++;
            streak++;
            send({ event: "error", malId, message: err.message });

            if (streak >= 5) {
              send({
                event: "abort",
                reason: `${streak} erros consecutivos`,
                ok,
                skip,
                fail,
              });
              aborted = true;
              break;
            }
          }

          const totalProcessed = ok + skip + fail;
          if (totalProcessed === 1 || totalProcessed % 10 === 0) {
            send({
              event: "progress",
              ok,
              skip,
              fail,
              remaining: pending.length - totalProcessed,
              last: lastTitle,
              elapsed_ms: Date.now() - startTime,
            });
          }
        }

        if (!aborted) {
          send({ event: "done", ok, skip, fail });
        }
      } catch (err: any) {
        send({ event: "fatal", message: err.message });
      } finally {
        syncRunning = false; // ← libera o lock
        try {
          controller.close();
        } catch {
          // já fechou
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}

// ─── GET ───

export async function GET() {
  const db = getDb();

  const { count: inDb } = db
    .prepare("SELECT COUNT(*) as count FROM anime")
    .get() as { count: number };

  const notFound = getNotFoundCount(db);
  const total = extractMalIds().length;
  const remaining = total - inDb - notFound;

  return NextResponse.json({
    inDb,
    notFound,
    inJsonl: total,
    remaining: Math.max(remaining, 0),
    percent:
      total > 0 ? (((inDb + notFound) / total) * 100).toFixed(1) + "%" : "0%",
    syncRunning, // ← frontend sabe se tem sync ativo
  });
}