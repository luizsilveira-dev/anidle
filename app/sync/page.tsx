"use client";

import { useState, useRef, useEffect, useCallback } from "react";

import Link from "next/link";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

type SyncStatus = "idle" | "running" | "done" | "error" | "aborted" | "waiting";
type LogType = "info" | "success" | "warning" | "error";

interface LogEntry {
  id: number;
  ts: number;
  type: LogType;
  message: string;
}

// Adicione syncRunning ao tipo DbStatus:
interface DbStatus {
  inDb: number;
  notFound: number;
  inJsonl: number;
  remaining: number;
  percent: string;
  syncRunning: boolean;  // ← novo
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

const RETRY_DELAY = 60; // segundos

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function SyncDashboard() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [dbLoading, setDbLoading] = useState(true);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [ok, setOk] = useState(0);
  const [skip, setSkip] = useState(0);
  const [fail, setFail] = useState(0);
  const [pending, setPending] = useState(0);
  const [total, setTotal] = useState(0);
  const [cached, setCached] = useState(0);
  const [currentItem, setCurrentItem] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const startTimeRef = useRef(0);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRetryRef = useRef(true);

  const processed = ok + skip + fail;
  const rate = elapsed > 0 ? processed / elapsed : 0;
  const itemsRemaining = Math.max(pending - processed, 0);
  const eta = rate > 0 ? itemsRemaining / rate : Infinity;
  const etaDate =
    isFinite(eta) && eta > 0 ? new Date(Date.now() + eta * 1000) : null;
  const pct = pending > 0 ? Math.min((processed / pending) * 100, 100) : 0;

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (syncStatus !== "running") return;
    const iv = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 1000);
    return () => clearInterval(iv);
  }, [syncStatus]);

  /* ── Limpar timer de retry no unmount ──────────── */
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  const fetchDbStatus = useCallback(async () => {
    setDbLoading(true);
    try {
      const r = await fetch("/api/sync");
      if (r.ok) setDbStatus(await r.json());
    } catch {
      /* silencioso */
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDbStatus();
  }, [fetchDbStatus]);

  /* ── Log helper (estável) ──────────────────────── */
  const addLog = useCallback((type: LogType, message: string) => {
    setLogs((prev) => [
      ...prev.slice(-499),
      { id: logIdRef.current++, ts: Date.now(), type, message },
    ]);
  }, []);

  /* ── Cancelar retry ────────────────────────────── */
  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    shouldRetryRef.current = false;
    setRetryCountdown(0);
    setSyncStatus("aborted");
    addLog("warning", "Auto-retry cancelado pelo usuário");
  }, [addLog]);

  /* ── Agendar retry ─────────────────────────────── */
  const scheduleRetry = useCallback(
    (startSyncFn: () => void) => {
      setSyncStatus("waiting");
      setRetryCountdown(RETRY_DELAY);

      addLog(
        "warning",
        `Tentando novamente em ${RETRY_DELAY}s…`
      );

      let remaining = RETRY_DELAY;

      retryTimerRef.current = setInterval(() => {
        remaining--;
        setRetryCountdown(remaining);

        if (remaining <= 0) {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;

          if (shouldRetryRef.current) {
            setRetryAttempt((a) => a + 1);
            startSyncFn();
          }
        }
      }, 1000);
    },
    [addLog]
  );

  /* ── Start Sync ────────────────────────────────── */
  const startSync = useCallback(async () => {
    // Limpar retry anterior
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    shouldRetryRef.current = true;

    setSyncStatus("running");
    setOk(0);
    setSkip(0);
    setFail(0);
    setPending(0);
    setTotal(0);
    setCached(0);
    setCurrentItem("");
    setElapsed(0);
    setRetryCountdown(0);

    // Não limpar logs nem retryAttempt em retries para manter histórico
    if (retryAttempt === 0) {
      setLogs([]);
      logIdRef.current = 0;
    }

    startTimeRef.current = Date.now();

    const setFinalElapsed = () => {
      if (startTimeRef.current)
        setElapsed((Date.now() - startTimeRef.current) / 1000);
    };

    let needsRetry = false;

    const handle = (ev: any) => {
      switch (ev.event) {
        case "start":
          setTotal(ev.total);
          setCached(ev.cached);
          setPending(ev.pending);
          addLog(
            "info",
            `Iniciando${retryAttempt > 0 ? ` (tentativa #${retryAttempt + 1})` : ""}: ${fmtNum(ev.pending)} pendentes de ${fmtNum(ev.total)} (${fmtNum(ev.cached)} já processados)`
          );
          if (ev.pending === 0) {
            // Nada a fazer — não agendar retry
            needsRetry = false;
          }
          break;

        case "progress":
          setOk(ev.ok);
          setSkip(ev.skip);
          setFail(ev.fail);
          if (ev.last) setCurrentItem(ev.last);
          addLog(
            "success",
            `${ev.last || "?"} — ${fmtNum(ev.ok + ev.skip + ev.fail)} processados`
          );
          break;

        case "skip":
          setSkip((p) => p + 1);
          addLog("warning", `404 — MAL#${ev.malId} não encontrado no AniList`);
          break;

        case "error":
          setFail((p) => p + 1);
          addLog("error", `Erro MAL#${ev.malId}: ${ev.message}`);
          break;

        case "done":
          if (ev.ok !== undefined) {
            setOk(ev.ok);
            setSkip(ev.skip);
            setFail(ev.fail);
          }
          addLog(
            "success",
            ev.message ??
              `✓ Concluído — ${fmtNum(ev.ok)} salvos, ${fmtNum(ev.skip)} não encontrados, ${fmtNum(ev.fail)} erros`
          );
          setFinalElapsed();
          setSyncStatus("done");
          setRetryAttempt(0);
          needsRetry = false;
          fetchDbStatus();
          break;

        case "abort":
          if (ev.ok !== undefined) {
            setOk(ev.ok);
            setSkip(ev.skip);
            setFail(ev.fail);
          }
          addLog("error", `⚠ Abortado: ${ev.reason}`);
          setFinalElapsed();
          needsRetry = true;
          fetchDbStatus();
          break;

        case "fatal":
          addLog("error", `💀 Fatal: ${ev.message}`);
          setFinalElapsed();
          needsRetry = true;
          break;
      }
    };

    // Dentro de startSync, substitua o bloco try que faz o fetch:

    try {
      const res = await fetch("/api/sync", { method: "POST" });

      // ── Sync já rodando (409) ──
      if (res.status === 409) {
        addLog(
          "warning",
          "Já existe um sync rodando no servidor. Aguarde ele terminar."
        );
        setSyncStatus("error");
        fetchDbStatus();
        return;
      }

      if (!res.body) throw new Error("Sem body na resposta");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;

        for (const ln of lines) {
          if (!ln.trim()) continue;
          try {
            handle(JSON.parse(ln));
          } catch {
            /* linha malformada */
          }
        }
      }

      if (buf.trim()) {
        try {
          handle(JSON.parse(buf));
        } catch {
          /* ignora */
        }
      }
    } catch (err: any) {
      addLog("error", `Erro de conexão: ${err.message}`);
      setFinalElapsed();
      needsRetry = true;
    }

    // ── Agendar retry se necessário ──
    if (needsRetry && shouldRetryRef.current) {
      scheduleRetry(startSync);
    } else if (needsRetry) {
      setSyncStatus("error");
    }
  }, [addLog, fetchDbStatus, retryAttempt, scheduleRetry]);

  /* ═══════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════ */

  const statusLabel: Record<SyncStatus, string> = {
    idle: "Parado",
    running: "Sincronizando…",
    done: "Concluído",
    error: "Erro",
    aborted: "Abortado",
    waiting: `Retry em ${retryCountdown}s`,
  };

  const statusColor: Record<SyncStatus, string> = {
    idle: "bg-zinc-600",
    running: "bg-blue-500",
    done: "bg-emerald-500",
    error: "bg-red-500",
    aborted: "bg-amber-500",
    waiting: "bg-orange-500",
  };

  const logColors: Record<LogType, string> = {
    info: "text-blue-400",
    success: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-red-400",
  };

  const logIcons: Record<LogType, string> = {
    info: "ℹ",
    success: "✓",
    warning: "⊘",
    error: "✗",
  };

  const isRunning = syncStatus === "running";
  const isWaiting = syncStatus === "waiting";
  const isBusy = isRunning || isWaiting;
  const hasProgress = syncStatus !== "idle" && (pending > 0 || processed > 0);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">← Voltar</Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            🔄 Anime DB Sync
          </h1>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white ${statusColor[syncStatus]}`}
          >
            {(isRunning || isWaiting) && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
            )}
            {statusLabel[syncStatus]}
          </span>
        </div>

        {/* ── Retry Banner ───────────────────────────── */}
        {isWaiting && (
          <div className="rounded-xl bg-orange-950/50 border border-orange-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-orange-400 tabular-nums w-16 text-center">
                {retryCountdown}s
              </div>
              <div>
                <p className="text-sm text-orange-200">
                  Erro detectado. Tentando novamente automaticamente…
                </p>
                {retryAttempt > 0 && (
                  <p className="text-xs text-orange-400 mt-0.5">
                    Tentativa #{retryAttempt + 1}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={cancelRetry}
              className="px-4 py-2 rounded-lg bg-orange-800 hover:bg-orange-700 text-orange-100 text-sm font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ── DB Status ──────────────────────────────── */}
        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Status do Banco
            </h2>
            <button
              onClick={fetchDbStatus}
              disabled={dbLoading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              ↻ Atualizar
            </button>
          </div>

          {dbLoading && !dbStatus ? (
            <p className="text-zinc-500 text-sm">Carregando…</p>
          ) : dbStatus ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <StatCard label="No banco" value={fmtNum(dbStatus.inDb)} />
              <StatCard
                label="404 (não existe)"
                value={fmtNum(dbStatus.notFound)}
              />
              <StatCard label="No JSONL" value={fmtNum(dbStatus.inJsonl)} />
              <StatCard label="Restante" value={fmtNum(dbStatus.remaining)} />
              <StatCard label="Processado" value={dbStatus.percent} />
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Erro ao carregar</p>
          )}
          
          {dbStatus?.syncRunning && (
            <p className="text-xs text-blue-400 mt-3 text-center animate-pulse">
              ⚡ Sync ativo no servidor
            </p>
          )}
        </section>

        {/* ── Progress ───────────────────────────────── */}
        {hasProgress && (
          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
            <div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-sm text-zinc-400">
                  Progresso do sync
                </span>
                <span className="font-mono text-xl font-bold tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-xs text-zinc-500 mt-1.5 text-center">
                {fmtNum(processed)} / {fmtNum(pending)} processados
                {currentItem && (
                  <>
                    {" — "}
                    <span className="text-zinc-300">{currentItem}</span>
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <CounterCard
                icon="✓"
                label="Salvos"
                value={fmtNum(ok)}
                color="text-emerald-400"
              />
              <CounterCard
                icon="⊘"
                label="404"
                value={fmtNum(skip)}
                color="text-amber-400"
              />
              <CounterCard
                icon="✗"
                label="Erros"
                value={fmtNum(fail)}
                color="text-red-400"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-zinc-800">
              <TimingCard label="⏱ Tempo" value={fmtDuration(elapsed)} />
              <TimingCard
                label="⚡ Taxa"
                value={rate > 0 ? `${rate.toFixed(2)}/s` : "--"}
              />
              <TimingCard
                label="⏳ ETA"
                value={isFinite(eta) && eta > 0 ? fmtDuration(eta) : "--"}
              />
              <TimingCard
                label="🏁 Previsão"
                value={etaDate ? `≈ ${fmtTime(etaDate)}` : "--"}
              />
            </div>
          </section>
        )}

        {/* ── Botão ──────────────────────────────────── */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              setRetryAttempt(0);
              startSync();
            }}
            disabled={isBusy}
            className={`
              px-8 py-3 rounded-xl text-base font-semibold text-white
              transition-all duration-200
              ${
                isBusy
                  ? "bg-zinc-700 cursor-not-allowed opacity-50"
                  : "bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-600/25 cursor-pointer"
              }
            `}
          >
            {isRunning
              ? "⏳ Sincronizando…"
              : isWaiting
                ? "⏳ Aguardando retry…"
                : syncStatus === "idle"
                  ? "▶ Iniciar Sync"
                  : "▶ Reiniciar Sync"}
          </button>
        </div>

        {/* ── Log ────────────────────────────────────── */}
        {logs.length > 0 && (
          <section className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Log
              </h2>
              <span className="text-xs text-zinc-600 tabular-nums">
                {retryAttempt > 0 && (
                  <span className="text-orange-500 mr-3">
                    tentativa #{retryAttempt + 1}
                  </span>
                )}
                {logs.length} {logs.length === 1 ? "entrada" : "entradas"}
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-px">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex gap-2 ${logColors[entry.type]}`}
                >
                  <span className="text-zinc-600 shrink-0 tabular-nums">
                    {new Date(entry.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="shrink-0 w-3 text-center">
                    {logIcons[entry.type]}
                  </span>
                  <span className="break-all">{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function CounterCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-800/60 p-3 text-center">
      <div className={`text-xl font-bold tabular-nums ${color}`}>
        {icon} {value}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function TimingCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">
        {value}
      </div>
    </div>
  );
}