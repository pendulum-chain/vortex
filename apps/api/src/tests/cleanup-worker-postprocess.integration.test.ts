import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type RampState from "../models/rampState.model";
import CleanupWorker from "../api/workers/cleanup.worker";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestRampState } from "../test-utils/factories";

// CleanupWorker's CronJob is created with runOnInit=true, so merely
// constructing the worker fires a real cleanup cycle in the background.
// Neutralize the tick target for the duration of this file.
const workerPrototype = CleanupWorker.prototype as unknown as { cleanup: () => Promise<void> };
const realCleanupCycle = workerPrototype.cleanup;
workerPrototype.cleanup = async () => {};

afterAll(() => {
  workerPrototype.cleanup = realCleanupCycle;
});

/**
 * Regression test for the postProcessCompletedStates query: it used to nest
 * Op.or inside the postCompleteState JSON path object, which Sequelize's
 * query builder rejects with `Invalid value { cleanupCompleted: false }` —
 * the error was caught and logged, so post-processing of completed ramps
 * silently never ran.
 */
describe("CleanupWorker.postProcessCompletedStates", () => {
  let worker: CleanupWorker;
  let processedStateIds: string[];

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    processedStateIds = [];
    worker = new CleanupWorker();
    // Stub the per-state cleanup handlers; this test only covers the query.
    // biome-ignore lint/suspicious/noExplicitAny: overriding a protected method for testing
    (worker as any).processCleanup = async (state: RampState) => {
      processedStateIds.push(state.id);
    };
  });

  async function runPostProcess(): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: calling the private method under test
    await (worker as any).postProcessCompletedStates();
  }

  it("finds completed states whose cleanup is pending or missing", async () => {
    const pendingCleanup = await createTestRampState({
      currentPhase: "complete",
      postCompleteState: { cleanup: { cleanupAt: null, cleanupCompleted: false, errors: null } }
    });
    const missingCleanupFlag = await createTestRampState({
      currentPhase: "failed",
      // biome-ignore lint/suspicious/noExplicitAny: simulating legacy rows without the cleanupCompleted flag
      postCompleteState: { cleanup: {} } as any
    });

    await runPostProcess();

    expect(processedStateIds.sort()).toEqual([pendingCleanup.id, missingCleanupFlag.id].sort());
  });

  it("skips states that are already cleaned up or not in a terminal phase", async () => {
    await createTestRampState({
      currentPhase: "complete",
      postCompleteState: { cleanup: { cleanupAt: new Date(), cleanupCompleted: true, errors: null } }
    });
    await createTestRampState({
      currentPhase: "initial",
      postCompleteState: { cleanup: { cleanupAt: null, cleanupCompleted: false, errors: null } }
    });

    await runPostProcess();

    expect(processedStateIds).toEqual([]);
  });
});
