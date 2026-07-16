import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { waitUntilTrue } from "@vortexfi/shared";
import RampState from "../../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestRampState } from "../../../test-utils/factories";
import type { PhaseHandler } from "./base-phase-handler";
import phaseRegistry from "./phase-registry";

/**
 * Regression test for the 2026-07 production CPU leak: the processor's execution
 * timeout raced handler.execute without cancelling it, so every timed-out
 * execution (e.g. a BRL onramp waiting for a payment that never arrives) left
 * its polling loop running forever. Leaked loops accumulated with each retry
 * and each recovery-worker pass until the CPU pegged.
 *
 * The processor must now hand each execution an AbortSignal, abort it on
 * timeout, and signal-aware polling helpers must stop.
 */

// Shrink the processor's timeouts before the class is instantiated. Originals are
// snapshotted and restored in afterAll so the overrides can't leak into other tests.
const OVERRIDDEN_ENV_VARS = ["PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS", "PHASE_PROCESSOR_RETRY_DELAY_MS"];
const originalEnv = new Map(OVERRIDDEN_ENV_VARS.map(name => [name, process.env[name]]));
process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS = "150";
process.env.PHASE_PROCESSOR_RETRY_DELAY_MS = "10";

const TEST_PHASE = "nablaSwap";

describe("PhaseProcessor execution cancellation", () => {
  let polls = 0;
  const receivedSignals: (AbortSignal | undefined)[] = [];

  const hangingHandler: PhaseHandler = {
    execute: async (_state: RampState, signal?: AbortSignal) => {
      receivedSignals.push(signal);
      // Poll forever, like a phase waiting for a payment that never arrives.
      await waitUntilTrue(
        async () => {
          polls++;
          return false;
        },
        5,
        signal
      );
      throw new Error("unreachable");
    },
    getMaxRetries: () => 2,
    getPhaseName: () => TEST_PHASE
  };

  // phaseRegistry is a process-wide singleton: shadow the real handler for the
  // duration of this file only, and restore (or remove) it in afterAll.
  const originalHandler = phaseRegistry.getHandler(TEST_PHASE);

  beforeAll(async () => {
    await setupTestDatabase();
    await resetTestDatabase();
    phaseRegistry.registerHandler(hangingHandler);
  });

  afterAll(() => {
    if (originalHandler) {
      phaseRegistry.registerHandler(originalHandler);
    } else {
      // The registry has no unregister API; drop the shadow entry directly.
      (phaseRegistry as unknown as { handlers: Map<string, PhaseHandler> }).handlers.delete(TEST_PHASE);
    }
    for (const name of OVERRIDDEN_ENV_VARS) {
      const originalValue = originalEnv.get(name);
      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  it("aborts abandoned executions so their polling loops stop", async () => {
    const state = await createTestRampState({ currentPhase: TEST_PHASE });

    const { PhaseProcessor } = await import("./phase-processor");
    const processor = new PhaseProcessor();
    await processor.processRamp(state.id);

    // The handler timed out, was retried up to getMaxRetries, then given up on.
    expect(receivedSignals.length).toBeGreaterThanOrEqual(2);
    expect(receivedSignals.every(signal => signal instanceof AbortSignal)).toBe(true);
    expect(receivedSignals.every(signal => signal?.aborted)).toBe(true);

    // Regression: without cancellation the abandoned loops keep polling forever.
    const pollsAfterGivingUp = polls;
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(polls).toBe(pollsAfterGivingUp);

    // The processor released the ramp for future processing.
    const reloaded = await RampState.findByPk(state.id);
    expect(reloaded?.processingLock.locked).toBe(false);
  });

  it("cleans up the timeout timer when a handler throws synchronously", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    const syncThrowHandler: PhaseHandler = {
      // Deliberately not async: thrown before Promise.race is entered, this used to
      // leak the timeout timer, whose later rejection nobody handled.
      execute: () => {
        throw new Error("sync boom");
      },
      getPhaseName: () => TEST_PHASE
    };
    phaseRegistry.registerHandler(syncThrowHandler);

    try {
      const state = await createTestRampState({ currentPhase: TEST_PHASE });
      const { PhaseProcessor } = await import("./phase-processor");
      const processor = new PhaseProcessor();
      await processor.processRamp(state.id);

      // Wait past MAX_EXECUTION_TIME_MS (150ms): a leaked timer would reject the
      // never-awaited timeout promise as an unhandled rejection.
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(unhandled).toEqual([]);

      // The sync throw still goes through the normal error path and releases the lock.
      const reloaded = await RampState.findByPk(state.id);
      expect(reloaded?.processingLock.locked).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      phaseRegistry.registerHandler(hangingHandler);
    }
  });

  it("falls back to default timeouts when env overrides are malformed", async () => {
    process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS = "banana";
    process.env.PHASE_PROCESSOR_RETRY_DELAY_MS = "-5";
    try {
      const { PhaseProcessor } = await import("./phase-processor");
      const processor = new PhaseProcessor() as unknown as { MAX_EXECUTION_TIME_MS: number; DEFAULT_RETRY_DELAY_MS: number };
      // A NaN here would make setTimeout fire immediately and time out every phase instantly.
      expect(processor.MAX_EXECUTION_TIME_MS).toBe(600000);
      expect(processor.DEFAULT_RETRY_DELAY_MS).toBe(30000);
    } finally {
      process.env.PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS = "150";
      process.env.PHASE_PROCESSOR_RETRY_DELAY_MS = "10";
    }
  });
});
