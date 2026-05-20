const DEFAULT_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(url: string | URL, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
  return fetch(url.toString(), {
    ...fetchInit,
    signal: AbortSignal.timeout(timeoutMs)
  });
}
