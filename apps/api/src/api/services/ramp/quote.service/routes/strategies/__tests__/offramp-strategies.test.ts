import { describe, expect, it } from "bun:test";
import { StageKey } from "../../../types";
import { OffRampPixStrategy } from "../offramp-pix.strategy";
import { OffRampSepaStrategy } from "../offramp-sepa.strategy";
import { OffRampCbuStrategy } from "../offramp-cbu.strategy";

function expectStages(strategyName: string, stages: StageKey[]) {
  expect(stages).toEqual([
    StageKey.OffRampInputPlanner,
    StageKey.OffRampSwap,
    StageKey.OffRampFee,
    StageKey.OffRampDiscount,
    StageKey.OffRampFinalize
  ]);
}

describe("Off-ramp strategies stage composition", () => {
  it("OffRampPixStrategy returns the expected stages", () => {
    const s = new OffRampPixStrategy();
    const stages = s.getStages({} as any);
    expectStages(s.name, stages);
  });

  it("OffRampSepaStrategy returns the expected stages", () => {
    const s = new OffRampSepaStrategy();
    const stages = s.getStages({} as any);
    expectStages(s.name, stages);
  });

  it("OffRampCbuStrategy returns the expected stages", () => {
    const s = new OffRampCbuStrategy();
    const stages = s.getStages({} as any);
    expectStages(s.name, stages);
  });
});
