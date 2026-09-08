/**
 * Registry for fire-and-forget work the app starts after a response or phase transition
 * (today: the ramp-completion email enqueue in the phase processor). Such work can still be
 * writing after the test that triggered it has finished, and a TRUNCATE issued while that
 * INSERT is in flight deadlocks in Postgres: the INSERT's foreign-key check waits for a table
 * the TRUNCATE already locked, while the TRUNCATE waits for the table the INSERT holds. The
 * fake world routes these entry points through trackBackgroundWork, and truncateAllTables
 * waits for everything tracked to settle first.
 */
const pending = new Set<Promise<void>>();

/** Records a fire-and-forget promise; returns the original so the caller's handling is unchanged. */
export function trackBackgroundWork<T>(promise: Promise<T>): Promise<T> {
  const settled: Promise<void> = promise
    .then(
      () => undefined,
      () => undefined
    )
    .finally(() => pending.delete(settled));
  pending.add(settled);
  return promise;
}

export function pendingBackgroundWorkCount(): number {
  return pending.size;
}

/** Resolves once no tracked work is in flight, including work started while waiting. */
export async function settleBackgroundWork(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }
}
