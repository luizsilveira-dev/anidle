"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

type Difficulty = "easy" | "medium" | "hard" | "impossible";

interface SearchResult {
  malId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
}

interface GameStateData {
  attemptsUsed: number;
  remaining: number;
  maxAttempts: number;
  difficulty: Difficulty;
  difficultyLabel: string;
  difficultyEmoji: string;
  blurHintAvailable: boolean;
  blurHintUsed: boolean;
  blurHintCost: number;
  blurHintMinGuesses: number;
}

interface LetterHint {
  length: number;
  revealed: { pos: number; char: string }[];
}

interface ListData {
  owners: string[];
  matching: string[];
  exactMatch: boolean;
  secretOwnerCount: number;
}

interface GuessData {
  guess: {
    malId: number;
    title: string;
    coverImage: string | null;
    year: number | null;
    studio: string;
    source: string;
    score: number | null;
    format: string;
    tags: string[];
  };
  hints: {
    year: "correct" | "higher" | "lower" | null;
    studio: boolean;
    source: boolean;
    score: "correct" | "higher" | "lower" | null;
    format: boolean;
    tags: string[];
  };
  list: ListData;
  correct: boolean;
  gameOver: boolean;
  gameState: GameStateData;
  letterHint: LetterHint | null;
  secret?: RevealedAnime;
  secretOwners?: string[];
}

interface RevealedAnime {
  malId: number;
  title: string;
  coverImage: string | null;
  year: number | null;
  studio: string;
  source: string;
  score: number | null;
  format: string;
  tags: string[];
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const DIFFICULTIES: {
  key: Difficulty;
  label: string;
  emoji: string;
  desc: string;
  color: string;
  border: string;
  shadow: string;
}[] = [
  {
    key: "easy",
    label: "Fácil",
    emoji: "🟢",
    desc: "Animes populares (100k+)",
    color: "bg-emerald-600 hover:bg-emerald-500",
    border: "border-emerald-600",
    shadow: "shadow-emerald-600/20",
  },
  {
    key: "medium",
    label: "Médio",
    emoji: "🟡",
    desc: "Animes conhecidos (50k–100k)",
    color: "bg-amber-600 hover:bg-amber-500",
    border: "border-amber-600",
    shadow: "shadow-amber-600/20",
  },
  {
    key: "hard",
    label: "Difícil",
    emoji: "🔴",
    desc: "Animes de nicho (20k–50k)",
    color: "bg-red-600 hover:bg-red-500",
    border: "border-red-600",
    shadow: "shadow-red-600/20",
  },
  {
    key: "impossible",
    label: "Impossível",
    emoji: "💀",
    desc: "Animes obscuros (<20k)",
    color: "bg-purple-600 hover:bg-purple-500",
    border: "border-purple-600",
    shadow: "shadow-purple-600/20",
  },
];

const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  MANGA: "Mangá",
  LIGHT_NOVEL: "Light Novel",
  VISUAL_NOVEL: "Visual Novel",
  VIDEO_GAME: "Game",
  NOVEL: "Novel",
  DOUJINSHI: "Doujinshi",
  ANIME: "Anime",
  WEB_NOVEL: "Web Novel",
  GAME: "Game",
  COMIC: "Comic",
  MULTIMEDIA_PROJECT: "Multimedia",
  OTHER: "Outro",
};

function fmtSource(s: string) {
  return SOURCE_LABELS[s] ?? s;
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function GamePage() {
  // ── Seleção de dificuldade ──
  const [phase, setPhase] = useState<"pick" | "playing">("pick");

  // ── Game state ──
  const [gameId, setGameId] = useState<string | null>(null);
  const [maxAttempts, setMaxAttempts] = useState(22);
  const [guesses, setGuesses] = useState<GuessData[]>([]);
  const [gs, setGs] = useState<GameStateData | null>(null);
  const [letterHint, setLetterHint] = useState<LetterHint | null>(null);
  const [blurImage, setBlurImage] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [revealed, setRevealed] = useState<RevealedAnime | null>(null);
  const [revealedOwners, setRevealedOwners] = useState<string[]>([]);
  const [error, setError] = useState("");

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fechar dropdown ──
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setShowDrop(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Search debounce ──
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/game/search?q=${encodeURIComponent(query)}`
        );
        const d = await r.json();
        setResults(d.results ?? []);
        setShowDrop(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Iniciar jogo ──
  const startGame = useCallback(async (difficulty: Difficulty) => {
    setGuesses([]);
    setGs(null);
    setLetterHint(null);
    setBlurImage(null);
    setGameOver(false);
    setWon(false);
    setRevealed(null);
    setRevealedOwners([]);
    setError("");
    setQuery("");
    setResults([]);

    try {
      const r = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Erro ao iniciar");
        return;
      }
      setGameId(d.gameId);
      setMaxAttempts(d.maxAttempts);
      setGs({
        attemptsUsed: 0,
        remaining: d.maxAttempts,
        maxAttempts: d.maxAttempts,
        difficulty,
        difficultyLabel: d.difficultyLabel,
        difficultyEmoji: d.difficultyEmoji,
        blurHintAvailable: false,
        blurHintUsed: false,
        blurHintCost: 10,
        blurHintMinGuesses: 5,
      });
      setPhase("playing");
    } catch {
      setError("Erro de conexão");
    }
  }, []);

  // ── Novo jogo (volta pra seleção) ──
  const newGame = useCallback(() => {
    setPhase("pick");
    setGameId(null);
    setGuesses([]);
    setGs(null);
    setLetterHint(null);
    setBlurImage(null);
    setGameOver(false);
    setWon(false);
    setRevealed(null);
    setRevealedOwners([]);
    setError("");
    setQuery("");
  }, []);

  // ── Chute ──
  async function guess(malId: number) {
    if (!gameId || gameOver || loading) return;

    if (guesses.some((g) => g.guess.malId === malId)) {
      setError("Você já chutou esse anime!");
      setTimeout(() => setError(""), 3000);
      return;
    }

    setLoading(true);
    setQuery("");
    setResults([]);
    setShowDrop(false);
    setError("");

    try {
      const r = await fetch("/api/game/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, malId }),
      });
      const d = await r.json();

      if (r.status === 409) {
        setError(d.error);
        return;
      }
      if (!r.ok) {
        setError(d.error ?? "Erro");
        return;
      }

      setGuesses((prev) => [d, ...prev]);
      setGs(d.gameState);
      if (d.letterHint) setLetterHint(d.letterHint);

      if (d.correct) {
        setWon(true);
        setGameOver(true);
        setRevealed(d.guess);
      } else if (d.gameOver) {
        setGameOver(true);
        setRevealed(d.secret ?? null);
        setRevealedOwners(d.secretOwners ?? []);
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // ── Desistir ──
  async function giveUp() {
    if (!gameId || gameOver) return;
    try {
      const r = await fetch("/api/game/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, giveUp: true }),
      });
      const d = await r.json();
      setGameOver(true);
      setRevealed(d.secret ?? null);
      setRevealedOwners(d.secretOwners ?? []);
    } catch {
      setError("Erro de conexão");
    }
  }

  // ── Blur hint ──
  async function useBlurHint() {
    if (!gameId || gameOver) return;
    try {
      const r = await fetch("/api/game/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, type: "blur" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Erro");
        return;
      }
      setBlurImage(d.blurImage);
      setGs(d.gameState);
    } catch {
      setError("Erro de conexão");
    }
  }

  const guessedIds = new Set(guesses.map((g) => g.guess.malId));
  const filtered = results.filter((r) => !guessedIds.has(r.malId));
  const attemptsUsed = gs?.attemptsUsed ?? 0;
  const remainingAttempts = gs?.remaining ?? maxAttempts;
  const pct = maxAttempts > 0 ? (attemptsUsed / maxAttempts) * 100 : 0;

  /* ═══════════════════════════════════════════════════
     TELA DE SELEÇÃO DE DIFICULDADE
     ═══════════════════════════════════════════════════ */

  if (phase === "pick") {
    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
            >
              ← Voltar
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              🎮 Anime Guesser
            </h1>
          </div>

          {error && (
            <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Escolha a dificuldade</h2>
            <p className="text-sm text-zinc-500">
              Baseado na popularidade do anime no AniList
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                onClick={() => startGame(d.key)}
                className={`group rounded-xl border ${d.border} bg-zinc-900 p-6
                           hover:bg-zinc-800 transition-all duration-300
                           hover:shadow-lg ${d.shadow} cursor-pointer text-left`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{d.emoji}</span>
                  <span className="text-lg font-bold text-white">
                    {d.label}
                  </span>
                </div>
                <p className="text-sm text-zinc-500">{d.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     TELA DO JOGO
     ═══════════════════════════════════════════════════ */

  const diffStyle = DIFFICULTIES.find((d) => d.key === gs?.difficulty);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
            >
              ← Voltar
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              🎮 Anime Guesser
            </h1>
            {gs && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  diffStyle?.border ?? "border-zinc-600"
                }`}
              >
                {gs.difficultyEmoji} {gs.difficultyLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!gameOver && guesses.length > 0 && (
              <button
                onClick={giveUp}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700
                           text-zinc-400 text-sm transition-colors cursor-pointer"
              >
                Desistir
              </button>
            )}
            <button
              onClick={newGame}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500
                         text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Novo Jogo
            </button>
          </div>
        </div>

        {/* ── Erro ── */}
        {error && (
          <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── Tentativas ── */}
        {gameId && (
          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Tentativas</span>
              <span className="font-mono text-sm font-bold tabular-nums">
                <span
                  className={
                    remainingAttempts <= 3
                      ? "text-red-400"
                      : remainingAttempts <= 7
                        ? "text-amber-400"
                        : "text-white"
                  }
                >
                  {remainingAttempts}
                </span>
                <span className="text-zinc-600"> / {maxAttempts}</span>
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  remainingAttempts <= 3
                    ? "bg-red-500"
                    : remainingAttempts <= 7
                      ? "bg-amber-500"
                      : "bg-blue-500"
                }`}
                style={{ width: `${100 - pct}%` }}
              />
            </div>
          </section>
        )}

        {/* ── Painel de dicas ── */}
        {gameId && !gameOver && (
          <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Dicas Especiais
            </h2>

            <div className="flex flex-wrap gap-3">
              {!gs?.blurHintUsed && (
                <button
                  onClick={useBlurHint}
                  disabled={!gs?.blurHintAvailable}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    gs?.blurHintAvailable
                      ? "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-600/20"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  }`}
                  title={
                    gs?.blurHintAvailable
                      ? `Revelar imagem borrada (-${gs.blurHintCost} tentativas)`
                      : `Disponível após ${gs?.blurHintMinGuesses ?? 5} chutes (custa ${gs?.blurHintCost ?? 10} tentativas)`
                  }
                >
                  🖼️ Imagem Borrada
                  <span className="ml-1.5 text-xs opacity-70">
                    (-{gs?.blurHintCost ?? 10})
                  </span>
                </button>
              )}

              {gs?.blurHintUsed && (
                <span className="px-4 py-2.5 rounded-lg text-sm bg-purple-900/30 text-purple-400 border border-purple-800">
                  🖼️ Imagem revelada ✓
                </span>
              )}

              {!gs?.blurHintAvailable && !gs?.blurHintUsed && (
                <span className="text-xs text-zinc-600 self-center">
                  Imagem: precisa de{" "}
                  {Math.max(0, (gs?.blurHintMinGuesses ?? 5) - attemptsUsed)}{" "}
                  chutes a mais
                </span>
              )}
            </div>

            {blurImage && (
              <div className="flex justify-center pt-2">
                <div className="relative rounded-lg overflow-hidden">
                  <img
                    src={blurImage}
                    alt="Dica"
                    className="w-32 h-48 object-cover"
                    style={{ filter: "blur(4px)", transform: "scale(1.1)" }}
                  />
                  <div className="absolute inset-0 border-2 border-purple-500/30 rounded-lg" />
                </div>
              </div>
            )}

            {letterHint && (
              <div className="pt-2">
                <p className="text-xs text-amber-500 mb-2">
                  🔤 Dica de nome (última chance!):
                </p>
                <div className="flex flex-wrap gap-1 font-mono text-lg">
                  {Array.from({ length: letterHint.length }).map((_, i) => {
                    const rev = letterHint.revealed.find((r) => r.pos === i);
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center justify-center w-7 h-9 rounded ${
                          rev
                            ? "bg-amber-900/50 text-amber-300 border border-amber-700 font-bold"
                            : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                        }`}
                      >
                        {rev ? rev.char : "_"}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Resultado ── */}
        {gameOver && revealed && (
          <div
            className={`rounded-xl border p-6 text-center ${
              won
                ? "bg-emerald-950/30 border-emerald-800"
                : "bg-red-950/30 border-red-800"
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              {revealed.coverImage && (
                <img
                  src={revealed.coverImage}
                  alt={revealed.title}
                  className="w-24 h-36 object-cover rounded-lg"
                />
              )}
              <div>
                <p className="text-2xl font-bold mb-1">
                  {won ? "🎉 Parabéns!" : "😔 Não foi dessa vez!"}
                </p>
                <p className="text-lg text-zinc-300">
                  {won
                    ? `Acertou em ${guesses.length} tentativa${guesses.length > 1 ? "s" : ""}!`
                    : "O anime secreto era:"}
                </p>
                <p className="text-xl font-bold mt-2 text-white">
                  {revealed.title}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {revealed.year ?? "?"} · {revealed.studio} ·{" "}
                  {fmtSource(revealed.source)} · Nota {revealed.score ?? "?"}
                </p>
                {revealedOwners.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-2">
                    📋 Na lista de: {revealedOwners.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Busca ── */}
        {!gameOver && gameId && (
          <div ref={boxRef} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => filtered.length > 0 && setShowDrop(true)}
              placeholder="🔍 Digite o nome de um anime…"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700
                         text-white placeholder-zinc-500
                         focus:outline-none focus:border-blue-500 transition-colors
                         disabled:opacity-50"
            />

            {showDrop && filtered.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl max-h-80 overflow-y-auto">
                {filtered.map((r) => (
                  <button
                    key={r.malId}
                    onClick={() => guess(r.malId)}
                    className="w-full flex items-center gap-3 px-4 py-3
                               hover:bg-zinc-800 transition-colors text-left
                               cursor-pointer first:rounded-t-xl last:rounded-b-xl"
                  >
                    {r.coverImage && (
                      <img
                        src={r.coverImage}
                        alt=""
                        className="w-8 h-12 object-cover rounded shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {r.titleRomaji}
                      </p>
                      {r.titleEnglish && r.titleEnglish !== r.titleRomaji && (
                        <p className="text-xs text-zinc-500 truncate">
                          {r.titleEnglish}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Contador ── */}
        {guesses.length > 0 && !gameOver && (
          <p className="text-center text-sm text-zinc-500">
            {guesses.length} tentativa{guesses.length > 1 ? "s" : ""}
          </p>
        )}

        {/* ── Chutes ── */}
        <div className="space-y-4">
          {guesses.map((g, i) => (
            <GuessCard
              key={`${g.guess.malId}-${i}`}
              data={g}
              number={guesses.length - i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Guess Card
   ═══════════════════════════════════════════════════════ */

function GuessCard({ data, number }: { data: GuessData; number: number }) {
  const { guess, hints, list, correct } = data;

  return (
    <div
      className={`rounded-xl border p-4 space-y-4 ${
        correct
          ? "bg-emerald-950/20 border-emerald-800"
          : "bg-zinc-900 border-zinc-800"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-600 font-mono">#{number}</span>
        {guess.coverImage && (
          <img
            src={guess.coverImage}
            alt=""
            className="w-10 h-14 object-cover rounded shrink-0"
          />
        )}
        <p className="font-bold text-white truncate">
          {guess.title}
          {correct && " ✓"}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <HintCell label="Ano" value={guess.year?.toString() ?? "?"} status={hints.year} />
        <HintCell label="Estúdio" value={guess.studio} status={hints.studio ? "correct" : "wrong"} />
        <HintCell label="Fonte" value={fmtSource(guess.source)} status={hints.source ? "correct" : "wrong"} />
        <HintCell label="Nota" value={guess.score?.toString() ?? "?"} status={hints.score} />
        <HintCell label="Formato" value={guess.format} status={hints.format ? "correct" : "wrong"} />
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-1.5">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {guess.tags.length > 0 ? (
            guess.tags.map((tag) => {
              const match = hints.tags.includes(tag);
              return (
                <span
                  key={tag}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    match
                      ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
                      : "bg-zinc-800 text-zinc-500 border-zinc-700"
                  }`}
                >
                  {tag}
                  {match && " ✓"}
                </span>
              );
            })
          ) : (
            <span className="text-xs text-zinc-600">Sem tags</span>
          )}
        </div>
      </div>

      <ListHint list={list} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   List Hint
   ═══════════════════════════════════════════════════════ */

function ListHint({ list }: { list: ListData }) {
  if (list.owners.length === 0) {
    return (
      <div className="text-xs text-zinc-600">
        📋 Não está na lista de ninguém
        {list.secretOwnerCount > 0 && (
          <span className="text-zinc-500 ml-1">
            (secreto está em {list.secretOwnerCount} lista
            {list.secretOwnerCount > 1 ? "s" : ""})
          </span>
        )}
      </div>
    );
  }

  const matchingSet = new Set(list.matching);

  return (
    <div className="text-xs">
      <span className="text-zinc-400">📋 Na lista de: </span>
      {list.owners.map((owner, i) => {
        const isMatch = matchingSet.has(owner);
        return (
          <span key={owner}>
            {i > 0 && ", "}
            <span
              className={
                list.exactMatch
                  ? "text-emerald-400 font-bold"
                  : isMatch
                    ? "text-amber-400 font-medium"
                    : "text-zinc-500"
              }
            >
              {owner}
              {list.exactMatch ? " ✓" : isMatch ? " ~" : ""}
            </span>
          </span>
        );
      })}

      {!list.exactMatch && list.secretOwnerCount > 0 && (
        <span className="text-zinc-600 ml-1">
          ({list.matching.length}/{list.secretOwnerCount} listas em comum)
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Hint Cell
   ═══════════════════════════════════════════════════════ */

function HintCell({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "correct" | "higher" | "lower" | "wrong" | null;
}) {
  const s = status ?? "unknown";

  const style: Record<string, string> = {
    correct: "bg-emerald-900/50 border-emerald-700 text-emerald-300",
    higher: "bg-amber-900/50 border-amber-700 text-amber-300",
    lower: "bg-amber-900/50 border-amber-700 text-amber-300",
    wrong: "bg-red-900/50 border-red-700 text-red-300",
    unknown: "bg-zinc-800 border-zinc-700 text-zinc-400",
  };

  const icon: Record<string, string> = {
    correct: " ✓",
    higher: " ↑",
    lower: " ↓",
    wrong: " ✗",
    unknown: "",
  };

  return (
    <div className={`rounded-lg border p-2 text-center ${style[s]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
        {label}
      </p>
      <p className="text-xs font-bold truncate">
        {value}
        {icon[s]}
      </p>
    </div>
  );
}