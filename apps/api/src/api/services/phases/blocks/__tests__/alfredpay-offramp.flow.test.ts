import { describe, expect, it } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  FiatToken,
  mapFiatToDestination,
  Networks,
  RampDirection,
  type RampPhase
} from "@vortexfi/shared";
const ALFREDPAY_OFFRAMP: RampPhase[] = [
  "initial",
  "squidRouterPermitExecute",
  "fundEphemeral",
  "finalSettlementSubsidy",
  "alfredpayOfframpTransfer",
  "distributeFees",
  "complete"
];
import { assemblePhaseFlow } from "../core/phase-flow";
import { alfredpayOfframpFlow, makeAlfredpayOfframpFlow } from "../flows/alfredpay-offramp";
import { getBlockFlowByIdentity, resolveBlockFlow } from "../flows/catalog";

const CORE_PHASES: RampPhase[] = [
  "squidRouterPermitExecute",
  "fundEphemeral",
  "finalSettlementSubsidy",
  "alfredpayOfframpTransfer",
  "distributeFees"
];

describe("Alfredpay offramp flow", () => {
  it("uses v4/schema 3 and rejects pre-rollout flow versions", () => {
    expect(alfredpayOfframpFlow.identity.version).toBe(4);
    expect(alfredpayOfframpFlow.identity.blockSchemaVersions.alfredpayOfframp).toBe(3);
    expect(() => getBlockFlowByIdentity({ ...alfredpayOfframpFlow.identity, version: 3 })).toThrow(
      /Unsupported persisted flow AlfredpayOfframp@3/
    );
  });

  it("preserves phase sequence and executor coverage", () => {
    expect(alfredpayOfframpFlow.phases).toEqual(CORE_PHASES);
    expect(alfredpayOfframpFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(assemblePhaseFlow(alfredpayOfframpFlow)).toEqual(ALFREDPAY_OFFRAMP);
  });

  it("uses one family for direct Polygon, same-chain Squid, and cross-chain sources", () => {
    for (const flow of [
      makeAlfredpayOfframpFlow(EvmToken.USDT, Networks.Polygon),
      makeAlfredpayOfframpFlow(EvmToken.USDC, Networks.Polygon),
      makeAlfredpayOfframpFlow(EvmToken.USDC, Networks.Base)
    ]) {
      expect(flow.name).toBe("AlfredpayOfframp");
      expect(flow.phases).toEqual(CORE_PHASES);
    }
  });

  it("maps every supported fiat payment method", () => {
    for (const outputCurrency of [FiatToken.USD, FiatToken.MXN, FiatToken.COP, FiatToken.ARS]) {
      const flow = resolveBlockFlow({
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Base,
        outputCurrency,
        rampType: RampDirection.SELL,
        to: mapFiatToDestination(outputCurrency)
      });
      expect(flow.name).toBe("AlfredpayOfframp");
    }
  });

  it("rejects a mismatched Alfredpay payment method", () => {
    expect(() =>
      resolveBlockFlow({
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Base,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.ACH
      })
    ).toThrow();
  });
});
