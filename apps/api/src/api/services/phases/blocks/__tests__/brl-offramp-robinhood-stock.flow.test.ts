import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../core/robinhood-stocks";
import {
  brlOfframpRobinhoodStockFlow,
  brlOfframpRobinhoodStockPhaseFlow,
  makeBrlOfframpRobinhoodStockFlow
} from "../flows/brl-offramp-robinhood-stock";
import { getBlockExecutorFlows, getBlockFlowByIdentity, resolveBlockFlow, resolvePersistedBlockFlow } from "../flows/catalog";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { StockPermitSource } from "../phases/stock-permit-source";
import { StockRouteSell } from "../phases/stock-route";

const SYMBOLS = Object.keys(ROBINHOOD_STOCKS) as StockSymbol[];

const CORE_PHASES: RampPhase[] = [
  "fundEphemeral",
  "stockPermitTransfer",
  "uniswapApprove",
  "uniswapSwap",
  "relayBridge",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase"
];

function request(token: StockSymbol) {
  return {
    from: Networks.Robinhood,
    inputAmount: "0.5",
    inputCurrency: token,
    network: Networks.Robinhood,
    outputCurrency: FiatToken.BRL,
    rampType: RampDirection.SELL,
    to: EPaymentMethod.PIX
  };
}

function persisted(token: StockSymbol, overrides: Record<string, unknown> = {}) {
  return {
    blocks: Object.fromEntries(brlOfframpRobinhoodStockFlow.contextKeys.map(key => [key, {}])),
    flow: brlOfframpRobinhoodStockFlow.identity,
    globals: {
      fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
      partner: null,
      request: request(token)
    },
    ...overrides
  };
}

describe("BRL offramp from a Robinhood Chain stock", () => {
  it("derives the phases, one executor each, and the phase flow", () => {
    expect(brlOfframpRobinhoodStockFlow.phases).toEqual(CORE_PHASES);
    expect(brlOfframpRobinhoodStockFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(brlOfframpRobinhoodStockPhaseFlow).toEqual(["initial", ...CORE_PHASES, "complete"]);
    expect(assemblePhaseFlow(brlOfframpRobinhoodStockFlow)).toEqual(["initial", ...CORE_PHASES, "complete"]);
  });

  it("owns one context per block", () => {
    expect(brlOfframpRobinhoodStockFlow.contextKeys).toEqual([
      "fundEphemeral",
      "stockPermitSource",
      "stockRoute",
      "distributeFees",
      "subsidizePreSwap",
      "nablaSwap",
      "aveniaOfframpFee",
      "subsidizePostSwap",
      "aveniaOfframpPayout"
    ]);
  });

  it("is registered under the NVDA instance and found again by identity", () => {
    expect(getBlockExecutorFlows()).toContain(brlOfframpRobinhoodStockFlow);
    expect(getBlockFlowByIdentity(brlOfframpRobinhoodStockFlow.identity)).toBe(brlOfframpRobinhoodStockFlow);
  });

  it("has the same identity and shape for all 12 tokens", () => {
    expect(SYMBOLS).toHaveLength(12);
    for (const symbol of SYMBOLS) {
      const flow = makeBrlOfframpRobinhoodStockFlow(symbol);
      expect(flow.identity).toEqual(brlOfframpRobinhoodStockFlow.identity);
      expect(flow.phases).toEqual(CORE_PHASES);
      expect(flow.contextKeys).toEqual(brlOfframpRobinhoodStockFlow.contextKeys);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    }
  });

  it.each(SYMBOLS)("resolves %s, fresh and persisted", symbol => {
    expect(resolveBlockFlow(request(symbol)).identity).toEqual(brlOfframpRobinhoodStockFlow.identity);
    expect(resolvePersistedBlockFlow(persisted(symbol)).identity).toEqual(brlOfframpRobinhoodStockFlow.identity);
  });

  it("does not resolve a persisted quote without a flow identity", () => {
    const { flow: _flow, ...legacy } = persisted(EvmToken.NVDA as StockSymbol);
    expect(() => resolvePersistedBlockFlow(legacy)).toThrow(/No block flow mapped/);
  });

  it("does not resolve a persisted quote whose token has left the allowlist", () => {
    const metadata = persisted(EvmToken.NVDA as StockSymbol);
    metadata.globals.request.inputCurrency = EvmToken.USDG as StockSymbol;
    expect(() => resolvePersistedBlockFlow(metadata)).toThrow(/Unsupported or ambiguous persisted flow/);
  });

  it.skip("rejects brand mismatches at compile time", () => {
    const funded = FlowBuilder.start(
      evmRequestIO(EvmToken.NVDA, Networks.Robinhood),
      FundEphemeral(EvmToken.NVDA, Networks.Robinhood)
    );
    // @ts-expect-error adjacency: the permit must carry the token the flow was funded for
    const _otherPermit = funded.pipe(StockPermitSource(EvmToken.TSLA));
    void _otherPermit;

    const sourced = funded.pipe(StockPermitSource(EvmToken.NVDA));
    // @ts-expect-error adjacency: the sell route must carry the token the permit delivered
    const _otherRoute = sourced.pipe(StockRouteSell(EvmToken.TSLA));
    void _otherRoute;
    // @ts-expect-error adjacency: fees are distributed in USDC on Base, the stock is still on Robinhood Chain
    const _feesBeforeBridge = sourced.pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>());
    void _feesBeforeBridge;
  });

  it("rejects duplicate metadata keys when built", () => {
    expect(() =>
      FlowBuilder.start(evmRequestIO(EvmToken.NVDA, Networks.Robinhood), FundEphemeral(EvmToken.NVDA, Networks.Robinhood))
        .pipe(FundEphemeral(EvmToken.NVDA, Networks.Robinhood))
        .build("DuplicateKey")
    ).toThrow("duplicate metadata key fundEphemeral");
  });
});
