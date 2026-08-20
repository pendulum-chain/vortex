import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import RampState from "../../../models/rampState.model";
import { PhaseProcessor } from "./phase-processor";

const originalFindByPk = RampState.findByPk;
const originalUpdate = RampState.update;
const update = mock(async () => [1, []] as never);

beforeEach(() => {
  RampState.findByPk = mock(async () => ({
    flowVariant: config.flowVariant,
    from: "pix",
    id: "moonbeam-ramp",
    processingLock: { locked: false, lockedAt: null },
    state: { flow: { id: "BrlOnrampAssethubUsdc" } },
    to: Networks.AssetHub,
    unsignedTxs: []
  })) as unknown as typeof RampState.findByPk;
  RampState.update = update as unknown as typeof RampState.update;
  update.mockClear();
});

afterEach(() => {
  RampState.findByPk = originalFindByPk;
  RampState.update = originalUpdate;
});

describe("PhaseProcessor Moonbeam retirement", () => {
  it("holds a Moonbeam-dependent ramp before acquiring its processing lock", async () => {
    await new PhaseProcessor().processRamp("moonbeam-ramp");

    expect(update).not.toHaveBeenCalled();
  });
});
