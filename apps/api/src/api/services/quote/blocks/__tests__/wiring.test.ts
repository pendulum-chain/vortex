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

  it("rejects an unmapped corridor at quote resolution", () => {
    expect(() => resolveBlockFlow({ ...mappedRequest, to: Networks.Base })).toThrow(APIError);
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
