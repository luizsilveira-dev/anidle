const ANILIST_URL = "https://graphql.anilist.co";

const QUERY = `
query Media($idMal: Int, $isMain: Boolean) {
  Media(idMal: $idMal, type: ANIME) {
    averageScore
    coverImage { medium }
    description
    episodes
    genres
    hashtag
    format
    seasonYear
    season
    source
    startDate { year }
    type
    title { english native romaji userPreferred }
    tags { category rank name }
    synonyms
    studios(isMain: $isMain) {
      edges { isMain node { name } }
    }
    meanScore
    popularity
    relations {
      edges {
        node { idMal }
        id
        relationType
      }
    }
    id
    idMal
  }
}
`;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Aborted", "AbortError"));

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Rate limiter dinâmico que calcula o delay ideal
 * baseado nos headers X-RateLimit-Remaining e X-RateLimit-Reset.
 *
 * Em vez de um delay fixo, distribui os requests restantes
 * uniformemente no tempo até o reset.
 */
export class RateLimiter {
  private remaining = 30;
  private rateLimit = 30;
  private resetEpoch = 0;
  private lastRequestTime = 0;
  private readonly minDelay: number;

  constructor(minDelayMs = 2000) {
    this.minDelay = minDelayMs;
  }

  async wait(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    // ── Sem requests restantes? Espera o reset inteiro ──
    if (this.remaining <= 1 && this.resetEpoch > nowSec) {
      const waitMs = (this.resetEpoch - nowSec + 2) * 1000;
      console.log(
        `[rate-limit] remaining=${this.remaining}, esperando reset: ${waitMs}ms`
      );
      await sleep(waitMs, signal);
      return;
    }

    // ── Calcula delay dinâmico ──
    let dynamicDelay = this.minDelay;

    if (this.remaining > 0 && this.resetEpoch > nowSec) {
      const timeUntilResetMs = (this.resetEpoch - nowSec) * 1000;

      // Distribui os requests restantes uniformemente no tempo,
      // com margem de 20% pra segurança
      dynamicDelay = Math.ceil((timeUntilResetMs / this.remaining) * 1.2);
    }

    // Nunca menos que o mínimo
    const delay = Math.max(dynamicDelay, this.minDelay);

    // Desconta o tempo já passado desde o último request
    const elapsed = now - this.lastRequestTime;
    const actualDelay = Math.max(delay - elapsed, 0);

    if (actualDelay > 0) {
      await sleep(actualDelay, signal);
    }

    this.lastRequestTime = Date.now();
  }

  update(headers: Headers): void {
    const rem = headers.get("x-ratelimit-remaining");
    const rst = headers.get("x-ratelimit-reset");
    const lim = headers.get("x-ratelimit-limit");

    if (rem) this.remaining = parseInt(rem, 10);
    if (rst) this.resetEpoch = parseInt(rst, 10);
    if (lim) this.rateLimit = parseInt(lim, 10);

    // Log pra debug (remover depois se quiser)
    const secsToReset = Math.max(this.resetEpoch - Math.floor(Date.now() / 1000), 0);
    console.log(
      `[rate-limit] ${this.remaining}/${this.rateLimit} remaining, reset in ${secsToReset}s`
    );
  }

  retryAfter(headers: Headers): number {
    return parseInt(headers.get("retry-after") ?? "60", 10);
  }
}

function isNotFoundError(json: any): boolean {
  if (!json?.errors?.length) return false;
  return json.errors.some(
    (e: any) =>
      e.status === 404 || e.message?.toLowerCase().includes("not found")
  );
}

export async function fetchAnime(
  malId: number,
  limiter: RateLimiter,
  maxRetries = 3,
  signal?: AbortSignal
): Promise<Record<string, any> | null> {
  await limiter.wait(signal);

  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { idMal: malId, isMain: true },
    }),
    signal,
  });

  limiter.update(res.headers);

  // --- 429: rate limited ---
  if (res.status === 429) {
    if (maxRetries <= 0) throw new Error(`429 em MAL#${malId}, sem retries`);

    const retryAfter = limiter.retryAfter(res.headers);
    // Espera o retry-after + margem de segurança
    const waitSec = retryAfter + 5;

    console.log(`[429] MAL#${malId} → retry em ${waitSec}s (retry-after=${retryAfter})`);
    await sleep(waitSec * 1000, signal);
    return fetchAnime(malId, limiter, maxRetries - 1, signal);
  }

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    try {
      const json = await res.json();
      if (isNotFoundError(json)) return null;
      throw new Error(
        `AniList ${res.status}: ${JSON.stringify(json.errors).slice(0, 200)}`
      );
    } catch (parseErr) {
      if (
        parseErr instanceof Error &&
        parseErr.message.startsWith("AniList")
      ) {
        throw parseErr;
      }
      const body = await res.text().catch(() => "");
      throw new Error(`AniList ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  const json = await res.json();

  if (isNotFoundError(json)) {
    return null;
  }

  if (json.errors?.length) {
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }

  return json.data?.Media ?? null;
}