function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Phase execution aborted");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

/**
 * Stop awaiting an API/RPC operation when the phase is abandoned. This cannot
 * cancel transports that do not expose AbortSignal support, but it prevents
 * the abandoned phase from performing any subsequent work or side effect.
 */
export function abortableCall<T>(signal: AbortSignal | undefined, call: () => Promise<T>): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return call();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });

    call()
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
  });
}
