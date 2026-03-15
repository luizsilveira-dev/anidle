import fs from "fs";
import path from "path";

const JSONL_PATH = path.join(
  process.cwd(),
  "data",
  "anime-offline-database.jsonl"
);

const MAL_RE = /https?:\/\/myanimelist\.net\/anime\/(\d+)/;

/**
 * Lê o JSONL e retorna MAL IDs únicos.
 * O arquivo tem ~25k linhas, cabe tranquilo em memória.
 */
export function extractMalIds(): number[] {
  const content = fs.readFileSync(JSONL_PATH, "utf-8");
  const seen = new Set<number>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed);
      const sources: string[] = entry.sources ?? [];
      for (const src of sources) {
        const match = src.match(MAL_RE);
        if (match) {
          seen.add(parseInt(match[1], 10));
          break;
        }
      }
    } catch {
      /* linha malformada, ignora */
    }
  }

  return [...seen];
}