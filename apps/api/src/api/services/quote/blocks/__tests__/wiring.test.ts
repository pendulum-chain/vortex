import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { APIError } from "../../../../errors/api-error";
import { BlockInitialExecutor } from "../core/initial-executor";
import { getBlockExecutorFlows, resolveBlockFlow } from "../flows/catalog";
import { getBlockFlowHandlers } from "../register-handlers";

const mappedRequest = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Arbitrum,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Arbitrum
};

describe("block flow production wiring", () => {
  it("resolves a mapped request to its destination-specific flow", () => {
    const flow = resolveBlockFlow(mappedRequest);
    expect(flow.name).toBe("BrlOnrampBaseCrossChain");
    expect(flow.phases).toEqual(getBlockExecutorFlows().find(candidate => candidate.name === flow.name)!.phases);
  });

  it("resolves Alfredpay cross-chain requests", () => {
    const flow = resolveBlockFlow({
      ...mappedRequest,
      from: EPaymentMethod.SPEI,
      inputCurrency: FiatToken.MXN
    });
    expect(flow.name).toBe("AlfredpayOnrampCrossChain");
  });

  it("resolves both Alfredpay Polygon variants to the direct flow family", () => {
    for (const outputCurrency of [EvmToken.USDT, EvmToken.USDC]) {
      const flow = resolveBlockFlow({
        ...mappedRequest,
        from: EPaymentMethod.SPEI,
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency,
        to: Networks.Polygon
      });
      expect(flow.name).toBe("AlfredpayOnrampDirect");
    }
  });

  it("rejects an unmapped corridor at quote resolution", () => {
    expect(() => resolveBlockFlow({ ...mappedRequest, outputCurrency: EvmToken.USDC, to: Networks.Base })).toThrow(APIError);
  });

  it("resolves BRL to BRLA on Base to the direct flow only", () => {
    const flow = resolveBlockFlow({
      ...mappedRequest,
      network: Networks.Base,
      outputCurrency: EvmToken.BRLA,
      to: Networks.Base
    });
    expect(flow.name).toBe("BrlOnrampBaseDirect");
    expect(flow.phases).toEqual(["brlaOnrampMint", "fundEphemeral", "destinationTransfer"]);
  });

  it("rejects mismatched direct-flow payment rails", () => {
    expect(() =>
      resolveBlockFlow({
        ...mappedRequest,
        from: EPaymentMethod.SPEI,
        network: Networks.Base,
        outputCurrency: EvmToken.BRLA,
        to: Networks.Base
      })
    ).toThrow(APIError);
    expect(() =>
      resolveBlockFlow({
        ...mappedRequest,
        from: EPaymentMethod.ACH,
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency: EvmToken.USDT,
        to: Networks.Polygon
      })
    ).toThrow(APIError);
  });

  it("rejects unsupported Alfredpay Polygon outputs during catalog resolution", () => {
    expect(() =>
      resolveBlockFlow({
        ...mappedRequest,
        from: EPaymentMethod.SPEI,
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        to: Networks.Polygon
      })
    ).toThrow(APIError);
  });

  it("derives one non-conflicting executor per phase from the catalog", () => {
    const handlers = getBlockFlowHandlers();
    const phases = handlers.map(handler => handler.getPhaseName());
    expect(handlers[0]).toBeInstanceOf(BlockInitialExecutor);
    expect(new Set(phases).size).toBe(phases.length);
    expect(phases).toEqual([
      "initial",
      ...new Set(getBlockExecutorFlows().flatMap(flow => flow.phases))
    ]);
  });
});
