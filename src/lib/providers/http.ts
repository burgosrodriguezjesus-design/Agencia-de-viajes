import "server-only";

/** User-Agent identificable para APIs de datos abiertos (lo exige Wikimedia). */
export const OPEN_DATA_UA = process.env.OPEN_DATA_USER_AGENT ?? "TravelPlannerMVP/0.1";

/**
 * Cabeceras para las APIs de Wikimedia. Con WIKIMEDIA_ACCESS_TOKEN (token
 * personal gratuito de api.wikimedia.org) las peticiones van autenticadas y
 * tienen un límite mucho más alto: recomendable en producción, donde las IP
 * de los proveedores cloud suelen estar muy limitadas en anónimo.
 */
export function wikimediaHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": OPEN_DATA_UA, "Api-User-Agent": OPEN_DATA_UA };
  const token = process.env.WIKIMEDIA_ACCESS_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

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
  init: RequestInit & { timeoutMs?: number; retries?: number; maxRetryAfterMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 12_000, retries = 1, maxRetryAfterMs = 0, ...rest } = init;
  let res: Response | null = null;
  let failure: ProviderError | null = null;
  let wait = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Reintento ante saturación (429) o fallo temporal del proveedor. Si el
    // proveedor indica cuánto esperar (Retry-After) y cabe en el margen, se respeta.
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, wait || 1200 * attempt));
    try {
      res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      failure = new ProviderError(provider, err instanceof Error ? err.message : "error de red");
      continue;
    }
    if (res.ok) break;
    failure = new ProviderError(provider, `HTTP ${res.status}`, res.status);
    if (res.status !== 429 && res.status < 500) break;
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      if (retryAfter > maxRetryAfterMs) break;
      wait = retryAfter + 500;
    } else {
      wait = 0;
    }
  }
  if (!res || !res.ok) {
    throw failure ?? new ProviderError(provider, "sin respuesta");
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(provider, "respuesta no válida", res.status);
  }
}
