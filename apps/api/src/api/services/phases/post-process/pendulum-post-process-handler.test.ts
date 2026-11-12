import { describe, expect, it } from "bun:test";
import type { PresignedTx } from "@vortexfi/shared";
import type RampState from "../../../../models/rampState.model";
import { PendulumPostProcessHandler } from "./pendulum-post-process-handler";

function ramp(presignedPhases: string[], currentPhase = "complete") {
  return { currentPhase, presignedTxs: presignedPhases.map(phase => ({ phase }) as PresignedTx) } as unknown as RampState;
}

describe("PendulumPostProcessHandler", () => {
  const handler = new PendulumPostProcessHandler();

  it("only takes completed ramps that presigned the Pendulum cleanup", () => {
    expect(handler.shouldProcess(ramp(["pendulumCleanup"]))).toBe(true);
    expect(handler.shouldProcess(ramp(["pendulumCleanup"], "failed"))).toBe(false);
  });

  it("leaves ramps that never touched Pendulum to their own chains' handlers", () => {
    // A Base or Robinhood Chain ramp presigns no Pendulum cleanup, so the sweep could only fail.
    expect(handler.shouldProcess(ramp(["baseCleanupBrla"]))).toBe(false);
    expect(handler.shouldProcess(ramp([]))).toBe(false);
  });
});
