import "server-only";

/** User-Agent identificable para APIs de datos abiertos (lo exige Wikimedia). */
export const OPEN_DATA_UA = process.env.OPEN_DATA_USER_AGENT ?? "TravelPlannerMVP/0.1";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

/** fetch JSON con tiempo límite; lanza ProviderError con el estado HTTP. */
export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 12_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ProviderError(provider, err instanceof Error ? err.message : "error de red");
  }
  if (!res.ok) {
    throw new ProviderError(provider, `HTTP ${res.status}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(provider, "respuesta no válida", res.status);
  }
}
