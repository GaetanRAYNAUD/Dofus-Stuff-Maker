import type { DofusData, Lang } from "./types";

const WORKER_URL = 'https://dofus-stuff-maker-worker.gaetanraynaud.fr';
const ETAG_KEY = (lang: Lang) => `dofus_etag_${ lang }`;
const DATA_KEY = (lang: Lang) => `dofus_data_${ lang }`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches Dofus data from the worker for the given language.
 *
 * Uses ETag + localStorage to avoid re-downloading unchanged data.
 * On a 304 the cached payload is returned directly.
 */
export async function fetchDofusData(lang: Lang = "fr"): Promise<DofusData> {
  const url = `${ WORKER_URL }?lang=${ lang }`;
  const headers: Record<string, string> = {};

  const cachedEtag = localStorage.getItem(ETAG_KEY(lang));
  if (cachedEtag) {
    headers["If-None-Match"] = cachedEtag;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    throw new ApiError(0, `Network error: ${ (err as Error).message }`);
  }

  if (res.status === 304) {
    const raw = localStorage.getItem(DATA_KEY(lang));
    if (raw) {
      return JSON.parse(raw) as DofusData;
    }
    // ETag mismatch with missing cache — retry without If-None-Match
    return fetchDofusData(lang);
  }

  if (!res.ok) {
    throw new ApiError(res.status, `Worker responded with ${ res.status }`);
  }

  const data = (await res.json()) as DofusData;

  const etag = res.headers.get("ETag");
  if (etag) {
    try {
      localStorage.setItem(ETAG_KEY(lang), etag);
      localStorage.setItem(DATA_KEY(lang), JSON.stringify(data));
    } catch {
      // localStorage full — not critical, next request will just re-fetch
    }
  }

  return data;
}
