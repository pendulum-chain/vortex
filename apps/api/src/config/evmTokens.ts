import { initializeEvmTokens } from "@vortexfi/shared";
import logger from "./logger";

const RETRY_INTERVAL_MS = 60_000;

/**
 * Loads the Squid token list at boot. Tokens only Squid lists (PAXG, ...) are unavailable while just the
 * static fallback is installed, so a failed first load is retried in the background until it succeeds.
 * Boot waits for the first attempt only, which is bounded by the fetch timeout.
 */
export async function loadEvmTokens(
  load: () => Promise<boolean> = initializeEvmTokens,
  retryIntervalMs = RETRY_INTERVAL_MS
): Promise<void> {
  if (await load()) return;

  logger.warn(`Squid token list unavailable, serving static tokens only; retrying every ${retryIntervalMs / 1000}s`);
  const timer = setInterval(async () => {
    if (await load()) {
      clearInterval(timer);
      logger.info("Squid token list loaded");
    }
  }, retryIntervalMs);
  timer.unref();
}
