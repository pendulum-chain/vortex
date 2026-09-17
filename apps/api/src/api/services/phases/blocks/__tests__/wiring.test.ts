import { describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { APIError } from "../../../../errors/api-error";
import type { Flow } from "../core/types";

const { BlockInitialExecutor } = await import("../core/initial-executor");
const { getBlockExecutorFlows, resolveBlockFlow, resolvePersistedBlockFlow } = await import("../flows/catalog");
const { getBlockFlowHandlers } = await import("../register-handlers");
const { PhaseProcessor } = await import("../../phase-processor");

const mappedRequest = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Arbitrum,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Arbitrum
};

function persistedMetadata(flow: Flow, request: Record<string, unknown>, includeIdentity = true) {
  return {
    blocks: Object.fromEntries(flow.contextKeys.map(key => [key, {}])),
    ...(includeIdentity ? { flow: flow.identity } : {}),
    globals: {
      fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
      partner: null,
      request
    }
  };
}

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

  it("resolves non-Polygon SEPA EUR onramps to the Monerium cross-chain flow", () => {
    const flow = resolveBlockFlow({
      ...mappedRequest,
      from: EPaymentMethod.SEPA,
      inputCurrency: FiatToken.EURC
    });
    expect(flow.name).toBe("MoneriumOnrampPolygonCrossChain");
    expect(() =>
      resolveBlockFlow({
        ...mappedRequest,
        from: EPaymentMethod.ACH,
        inputCurrency: FiatToken.EURC
      })
    ).toThrow(APIError);
  });

  it("resolves every supported EUR Base output through Monerium", () => {
    const eurBaseRequest = {
      ...mappedRequest,
      from: EPaymentMethod.SEPA,
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      to: Networks.Base
    };
    for (const outputCurrency of [
      EvmToken.EURC,
      EvmToken.USDC,
      EvmToken.USDT,
      EvmToken.ETH,
      EvmToken.AXLUSDC,
      EvmToken.BRLA
    ]) {
      expect(resolveBlockFlow({ ...eurBaseRequest, outputCurrency }).name).toBe("MoneriumOnrampPolygonCrossChain");
    }
    expect(() => resolveBlockFlow({ ...eurBaseRequest, from: EPaymentMethod.ACH, outputCurrency: EvmToken.USDC })).toThrow(
      APIError
    );
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

  it("resolves every supported BRL Base output to its exact static flow", () => {
    expect(resolveBlockFlow({ ...mappedRequest, network: Networks.Base, to: Networks.Base }).name).toBe(
      "BrlOnrampBaseSameChain"
    );
    for (const outputCurrency of [EvmToken.USDT, EvmToken.ETH, EvmToken.AXLUSDC, EvmToken.EURC]) {
      expect(resolveBlockFlow({ ...mappedRequest, network: Networks.Base, outputCurrency, to: Networks.Base }).name).toBe(
        "BrlOnrampBaseSameChainSwap"
      );
    }
  });

  it("rejects Base requests outside the exact BRL PIX predicates", () => {
    expect(() =>
      resolveBlockFlow({ ...mappedRequest, from: EPaymentMethod.SPEI, network: Networks.Base, to: Networks.Base })
    ).toThrow(APIError);
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

  it("keeps internal EURE out of public catalog routes", () => {
    const dormantEure = "EURE";
    const requests = [
      {
        ...mappedRequest,
        from: EPaymentMethod.SEPA,
        inputCurrency: FiatToken.EURC,
        network: Networks.Base,
        outputCurrency: dormantEure,
        to: Networks.Base
      },
      { ...mappedRequest, network: Networks.Base, outputCurrency: dormantEure, to: Networks.Base },
      { ...mappedRequest, from: EPaymentMethod.SEPA, inputCurrency: FiatToken.EURC, outputCurrency: dormantEure },
      { ...mappedRequest, outputCurrency: dormantEure },
      {
        ...mappedRequest,
        from: Networks.Base,
        inputCurrency: dormantEure,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.SEPA
      },
      {
        ...mappedRequest,
        from: Networks.Base,
        inputCurrency: dormantEure,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.PIX
      },
      {
        ...mappedRequest,
        from: Networks.Base,
        inputCurrency: dormantEure,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.SPEI
      }
    ];

    for (const request of requests) {
      expect(() => resolveBlockFlow(request as never)).toThrow(APIError);
    }
  });

  it("keeps Mykobo available only for persisted recovery", () => {
    const request = {
      ...mappedRequest,
      from: EPaymentMethod.SEPA,
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      outputCurrency: EvmToken.EURC,
      to: Networks.Base
    };
    const legacyFlow = getBlockExecutorFlows().find(flow => flow.name === "EurOnrampBaseDirect");
    expect(legacyFlow).toBeDefined();

    expect(resolvePersistedBlockFlow(persistedMetadata(legacyFlow!, request)).name).toBe("EurOnrampBaseDirect");
    expect(resolvePersistedBlockFlow(persistedMetadata(legacyFlow!, request, false)).name).toBe("EurOnrampBaseDirect");

    const moneriumFlow = resolveBlockFlow(request);
    expect(resolvePersistedBlockFlow(persistedMetadata(moneriumFlow, request)).name).toBe(
      "MoneriumOnrampPolygonCrossChain"
    );
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

  it("rejects handler shortcuts outside the persisted flow transition graph", () => {
    const flow = resolveBlockFlow(mappedRequest);
    const originalPhase = flow.phases[0];
    const state = {
      id: "ramp-1",
      state: {
        flow: flow.identity,
        phaseFlow: ["initial", ...flow.phases, "complete"]
      }
    };
    const processor = new PhaseProcessor() as unknown as {
      resolveNextPhase(original: string, result: { currentPhase: string }, state: unknown): string;
    };

    expect(() => processor.resolveNextPhase(originalPhase, { currentPhase: "complete" }, state)).toThrow(
      "is not allowed"
    );
    expect(processor.resolveNextPhase(originalPhase, { currentPhase: "failed" }, state)).toBe("failed");
  });
});
