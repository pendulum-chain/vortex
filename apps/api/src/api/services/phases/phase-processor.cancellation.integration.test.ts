import { beforeAll, describe, expect, it } from "bun:test";
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

// Shrink the processor's timeouts before the class is instantiated.
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

  beforeAll(async () => {
    await setupTestDatabase();
    await resetTestDatabase();
    phaseRegistry.registerHandler(hangingHandler);
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
});
