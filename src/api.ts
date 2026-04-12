import type { DofusData } from "./types";

const DATA_URL = "./data/items.json";

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
 * Loads Dofus data from the pre-built static JSON file.
 * Browser HTTP caching handles avoiding redundant downloads.
 */
export async function fetchDofusData(): Promise<DofusData> {
  let res: Response;
  try {
    res = await fetch(DATA_URL);
  } catch (err) {
    throw new ApiError(0, `Network error: ${ (err as Error).message }`);
  }

  if (!res.ok) {
    throw new ApiError(res.status, `Failed to load items.json: ${ res.status }`);
  }

  return res.json() as Promise<DofusData>;
}
