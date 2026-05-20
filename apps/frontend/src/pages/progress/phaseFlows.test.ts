import { describe, expect, it } from "vitest";
import { PHASE_FLOWS } from "./phaseFlows";

describe("progress phase flows", () => {
  it("matches the active BRL offramp Base runtime phases", () => {
    expect(PHASE_FLOWS.offramp_brl).toEqual([
      "initial",
      "fundEphemeral",
      "distributeFees",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "subsidizePostSwap",
      "brlaPayoutOnBase",
      "complete"
    ]);
  });

  it("matches the active BRL onramp Base runtime phases", () => {
    expect(PHASE_FLOWS.onramp_brl).toEqual([
      "initial",
      "brlaOnrampMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "squidRouterSwap",
      "squidRouterPay",
      "finalSettlementSubsidy",
      "destinationTransfer",
      "complete"
    ]);
  });
});
