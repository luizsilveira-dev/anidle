export const MAX_ATTEMPTS = 22;
export const BLUR_HINT_COST = 10;
export const BLUR_HINT_MIN_GUESSES = 5;

export type Difficulty = "easy" | "medium" | "hard" | "impossible";

export const DIFFICULTY_RANGES: Record<Difficulty, { min: number; max: number; label: string; emoji: string }> = {
  easy:       { min: 100000, max: 999999999, label: "Fácil",      emoji: "🟢" },
  medium:     { min: 50000,  max: 99999,     label: "Médio",      emoji: "🟡" },
  hard:       { min: 20000,  max: 49999,     label: "Difícil",    emoji: "🔴" },
  impossible: { min: 1,      max: 19999,     label: "Impossível", emoji: "💀" },
};

interface LetterHint {
  length: number;
  revealed: { pos: number; char: string }[];
}

export interface GameSession {
  secretMalId: number;
  difficulty: Difficulty;
  createdAt: number;
  maxAttempts: number;
  attemptsUsed: number;
  blurHintUsed: boolean;
  letterHint: LetterHint | null;
  guessedMalIds: Set<number>;
}

const sessions = new Map<string, GameSession>();

function cleanup() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}

export function createSession(secretMalId: number, difficulty: Difficulty): string {
  cleanup();
  const gameId = crypto.randomUUID();
  sessions.set(gameId, {
    secretMalId,
    difficulty,
    createdAt: Date.now(),
    maxAttempts: MAX_ATTEMPTS,
    attemptsUsed: 0,
    blurHintUsed: false,
    letterHint: null,
    guessedMalIds: new Set(),
  });
  return gameId;
}

export function getSession(gameId: string): GameSession | null {
  return sessions.get(gameId) ?? null;
}

export function deleteSession(gameId: string) {
  sessions.delete(gameId);
}

export function remaining(s: GameSession): number {
  return s.maxAttempts - s.attemptsUsed;
}

export function canUseBlurHint(s: GameSession): boolean {
  return (
    s.attemptsUsed >= BLUR_HINT_MIN_GUESSES &&
    remaining(s) >= BLUR_HINT_COST &&
    !s.blurHintUsed
  );
}

export function useBlurHint(s: GameSession): boolean {
  if (!canUseBlurHint(s)) return false;
  s.attemptsUsed += BLUR_HINT_COST;
  s.blurHintUsed = true;
  return true;
}

export function useAttempt(s: GameSession, malId: number) {
  s.attemptsUsed++;
  s.guessedMalIds.add(malId);
}

export function getLetterHint(s: GameSession, title: string): LetterHint | null {
  if (s.letterHint) return s.letterHint;
  if (!title || title.length === 0) return null;

  const revealed: { pos: number; char: string }[] = [];
  revealed.push({ pos: 0, char: title[0] });

  if (title.length > 1) {
    const candidates: number[] = [];
    for (let i = 1; i < title.length; i++) {
      if (title[i] !== " ") candidates.push(i);
    }
    if (candidates.length > 0) {
      const idx = candidates[Math.floor(Math.random() * candidates.length)];
      revealed.push({ pos: idx, char: title[idx] });
    }
  }

  s.letterHint = { length: title.length, revealed };
  return s.letterHint;
}

export function gameState(s: GameSession) {
  return {
    attemptsUsed: s.attemptsUsed,
    remaining: remaining(s),
    maxAttempts: s.maxAttempts,
    difficulty: s.difficulty,
    difficultyLabel: DIFFICULTY_RANGES[s.difficulty].label,
    difficultyEmoji: DIFFICULTY_RANGES[s.difficulty].emoji,
    blurHintAvailable: canUseBlurHint(s),
    blurHintUsed: s.blurHintUsed,
    blurHintCost: BLUR_HINT_COST,
    blurHintMinGuesses: BLUR_HINT_MIN_GUESSES,
  };
}