import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, Networks } from "@vortexfi/shared";
import RampState from "../../models/rampState.model";
import phaseProcessor from "../services/phases/phase-processor";
import RampRecoveryWorker from "./ramp-recovery.worker";

const originalFindAll = RampState.findAll;
const originalProcessRamp = phaseProcessor.processRamp;
const processRamp = mock(async () => undefined);

beforeEach(() => {
  RampState.findAll = mock(async () => [
    {
      currentPhase: "brlaOnrampMint",
      from: EPaymentMethod.PIX,
      id: "moonbeam-ramp",
      state: { flow: { id: "BrlOnrampAssethubUsdc" } },
      to: Networks.AssetHub,
      unsignedTxs: []
    }
  ]) as unknown as typeof RampState.findAll;
  phaseProcessor.processRamp = processRamp;
  processRamp.mockClear();
});

afterEach(() => {
  RampState.findAll = originalFindAll;
  phaseProcessor.processRamp = originalProcessRamp;
});

describe("RampRecoveryWorker Moonbeam retirement", () => {
  it("does not report or invoke automatic recovery for Moonbeam-dependent ramps", async () => {
    const worker = new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> };

    await worker.recover();

    expect(processRamp).not.toHaveBeenCalled();
  });
});
