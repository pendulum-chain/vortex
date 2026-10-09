/**
 * Replaces global fetch with a guard that only allows loopback traffic
 * (the in-process test app). Any other HTTP call is a hermeticity violation
 * and fails with a descriptive error instead of silently reaching a real
 * service. viem's http transport goes through global fetch, so RPC calls are
 * covered too. The test preload installs it for every hermetic run.
 */
let originalFetch: typeof fetch | null = null;

const LOOPBACK_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/;

/** Returns the uninstaller; a no-op when an outer caller (the preload) already owns the guard. */
export function installFetchGuard(): () => void {
  if (originalFetch) {
    return () => undefined;
  }
  const realFetch = globalThis.fetch;
  originalFetch = realFetch;

  const guard = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!/^https?:\/\//.test(url) || LOOPBACK_PATTERN.test(url)) {
      return realFetch(input, init);
    }
    return Promise.reject(
      new Error(
        `Hermetic test violation: attempted external HTTP call to ${url}. ` +
          "Extend the fakes in src/test-utils/fake-world instead of letting code reach the network."
      )
    );
  }) as typeof fetch;

  globalThis.fetch = Object.assign(guard, realFetch);
  return uninstallFetchGuard;
}

function uninstallFetchGuard(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}
