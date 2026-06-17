import type { RampDirection, RampPhase } from "@vortexfi/shared";
import type { Flow } from "./types";

export function assemblePhaseFlow(flow: Flow, opts: { direction: RampDirection; isBaseVault: boolean }): RampPhase[] {
  const { isBaseVault } = opts;
  const corePhases: RampPhase[] = isBaseVault
    ? flow.phases.filter(phase => phase !== "squidRouterSwap" && phase !== "squidRouterPay")
    : [...flow.phases];

  const result: RampPhase[] = ["initial"];
  for (const phase of corePhases) {
    result.push(phase);
    if (phase === "mykoboOnrampDeposit") {
      result.push("fundEphemeral");
    }
    if (phase === "nablaSwap") {
      result.push("distributeFees");
    }
    if (phase === "squidRouterPay" && !isBaseVault) {
      result.push("finalSettlementSubsidy");
    }
  }
  result.push("complete");
  return result;
}
