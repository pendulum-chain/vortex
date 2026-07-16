/**
 * Helpers for the external API contract suites (docs/features/contract-tests.md).
 *
 * Partner sandboxes are allowed to be shaky: any error thrown by the live call
 * itself (network failure, 5xx, rate limit) makes the check INCONCLUSIVE — logged
 * and skipped, never failed. Only a successful response that violates a schema
 * fails a contract test, so the nightly alert channel stays meaningful.
 *
 * The nightly workflow sets CONTRACT_EXPECT_LIVE=1: a run where zero live calls
 * completed (credential rot, endpoint down all night) then fails instead of
 * rotting as green-but-empty. Counters are per test file (bun isolates files),
 * so every contract suite asserts its own live coverage.
 */
let liveCompleted = 0;

export async function runLive<T>(label: string, call: () => Promise<T>): Promise<T | null> {
  try {
    const result = await call();
    liveCompleted += 1;
    return result;
  } catch (error) {
    console.warn(`[contract:live] ${label} inconclusive: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function assertLiveCoverage(): void {
  if (process.env.CONTRACT_EXPECT_LIVE && liveCompleted === 0) {
    throw new Error(
      "CONTRACT_EXPECT_LIVE=1 but no live contract call completed in this suite — " +
        "check partner endpoint availability and credentials."
    );
  }
}
