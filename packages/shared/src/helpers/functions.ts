function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Aborted");
}

/**
 * Sleep for `ms` milliseconds, rejecting early if `signal` aborts.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitUntilTrue(test: () => Promise<boolean>, periodMs = 1000, signal?: AbortSignal) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      throw abortReason(signal);
    }
    if (await test()) {
      return true;
    }
    await sleep(periodMs, signal);
  }
}

export async function waitUntilTrueWithTimeout(
  test: () => Promise<boolean>,
  periodMs = 1000,
  timeoutMs = 180000,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw abortReason(signal);
  }

  // The polling loop must be aborted when the timeout fires (or the caller aborts):
  // a plain Promise.race would leave it polling forever after the race settles.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(abortReason(signal as AbortSignal));
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const timeoutError = new Error(`Timeout waiting for condition after ${timeoutMs} ms`);
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    await Promise.race([waitUntilTrue(test, periodMs, controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}
