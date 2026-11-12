import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO, fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../core/robinhood-stocks";
import {
  brlOnrampRobinhoodStockFlow,
  brlOnrampRobinhoodStockPhaseFlow,
  makeBrlOnrampRobinhoodStockFlow
} from "../flows/brl-onramp-robinhood-stock";
import { getBlockExecutorFlows, getBlockFlowByIdentity, resolveBlockFlow, resolvePersistedBlockFlow } from "../flows/catalog";
import { AveniaStockMint } from "../phases/avenia-stock-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { GasReserveTopUp } from "../phases/gas-reserve-top-up";
import { NablaSwap } from "../phases/nabla-swap";
import { StockRouteBuy } from "../phases/stock-route";
import { StockSettlement } from "../phases/stock-settlement";

const SYMBOLS = Object.keys(ROBINHOOD_STOCKS) as StockSymbol[];

const CORE_PHASES: RampPhase[] = [
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "relayBridge",
  "uniswapApprove",
  "uniswapSwap",
  "stockSettlementTopUp",
  "destinationTransfer",
  "gasReserveTopUp"
];

const CONTEXT_KEYS = [
  "aveniaMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "stockRoute",
  "stockSettlement",
  "destinationTransfer",
  "gasReserveTopUp"
];

function request(token: StockSymbol) {
  return {
    from: EPaymentMethod.PIX,
    inputAmount: "500",
    inputCurrency: FiatToken.BRL,
    network: Networks.Robinhood,
    outputCurrency: token,
    rampType: RampDirection.BUY,
    to: Networks.Robinhood
  };
}

function persisted(token: StockSymbol, overrides: Record<string, unknown> = {}) {
  return {
    blocks: Object.fromEntries(brlOnrampRobinhoodStockFlow.contextKeys.map(key => [key, {}])),
    flow: brlOnrampRobinhoodStockFlow.identity,
    globals: {
      fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
      partner: null,
      request: request(token)
    },
    ...overrides
  };
}

describe("BRL onramp to a Robinhood Chain stock", () => {
  it("derives the phases, one executor each, and the phase flow", () => {
    expect(brlOnrampRobinhoodStockFlow.phases).toEqual(CORE_PHASES);
    expect(brlOnrampRobinhoodStockFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(brlOnrampRobinhoodStockPhaseFlow).toEqual(["initial", ...CORE_PHASES, "complete"]);
    expect(assemblePhaseFlow(brlOnrampRobinhoodStockFlow)).toEqual(["initial", ...CORE_PHASES, "complete"]);
  });

  it("owns one context per block", () => {
    expect(brlOnrampRobinhoodStockFlow.contextKeys).toEqual(CONTEXT_KEYS);
  });

  it("is registered under the NVDA instance and found again by identity", () => {
    expect(getBlockExecutorFlows()).toContain(brlOnrampRobinhoodStockFlow);
    expect(getBlockFlowByIdentity(brlOnrampRobinhoodStockFlow.identity)).toBe(brlOnrampRobinhoodStockFlow);
  });

  it("has the same identity and shape for all 12 tokens", () => {
    expect(SYMBOLS).toHaveLength(12);
    for (const symbol of SYMBOLS) {
      const flow = makeBrlOnrampRobinhoodStockFlow(symbol);
      expect(flow.identity).toEqual(brlOnrampRobinhoodStockFlow.identity);
      expect(flow.phases).toEqual(CORE_PHASES);
      expect(flow.contextKeys).toEqual(CONTEXT_KEYS);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    }
  });

  it.each(SYMBOLS)("resolves %s, fresh and persisted", symbol => {
    expect(resolveBlockFlow(request(symbol)).identity).toEqual(brlOnrampRobinhoodStockFlow.identity);
    expect(resolvePersistedBlockFlow(persisted(symbol)).identity).toEqual(brlOnrampRobinhoodStockFlow.identity);
  });

  it("does not resolve a persisted quote without a flow identity", () => {
    const { flow: _flow, ...legacy } = persisted(EvmToken.NVDA as StockSymbol);
    expect(() => resolvePersistedBlockFlow(legacy)).toThrow(/No block flow mapped/);
  });

  it("does not resolve a persisted quote whose token has left the allowlist", () => {
    const metadata = persisted(EvmToken.NVDA as StockSymbol);
    metadata.globals.request.outputCurrency = EvmToken.USDG as StockSymbol;
    expect(() => resolvePersistedBlockFlow(metadata)).toThrow(/Unsupported or ambiguous persisted flow/);
  });

  it("rejects a tampered identity", () => {
    const flow = { ...brlOnrampRobinhoodStockFlow.identity, topologyHash: "0".repeat(64) };
    expect(() => resolvePersistedBlockFlow(persisted(EvmToken.NVDA as StockSymbol, { flow }))).toThrow(/identity mismatch/);
  });

  it.skip("rejects brand mismatches at compile time", () => {
    // @ts-expect-error entry adjacency: an EVM resolver cannot feed a fiat phase
    const _wrongEntry = FlowBuilder.start(evmRequestIO(EvmToken.USDC, Networks.Base), AveniaStockMint);
    void _wrongEntry;

    const minted = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaStockMint);
    // @ts-expect-error adjacency: the route takes USDC on Base, the mint delivers BRLA
    const _routeAfterMint = minted.pipe(StockRouteBuy(EvmToken.NVDA));
    void _routeAfterMint;

    const swapped = minted
      .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
      .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
      .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>());
    // @ts-expect-error adjacency: settlement is on Robinhood Chain, the swap ended on Base
    const _settleOnBase = swapped.pipe(StockSettlement(EvmToken.NVDA));
    void _settleOnBase;

    const routed = swapped.pipe(StockRouteBuy(EvmToken.NVDA));
    // @ts-expect-error adjacency: the settlement token must be the routed token
    const _otherToken = routed.pipe(StockSettlement(EvmToken.TSLA));
    void _otherToken;
    // @ts-expect-error adjacency: the delivery token must be the routed token
    const _otherDelivery = routed.pipe(DestinationTransfer<typeof EvmToken.TSLA, typeof Networks.Robinhood>());
    void _otherDelivery;
    // @ts-expect-error adjacency: the reserve follows delivery of the same token
    const _otherReserve = routed.pipe(GasReserveTopUp(EvmToken.TSLA));
    void _otherReserve;
  });

  it("rejects duplicate metadata keys when built", () => {
    expect(() =>
      FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaStockMint)
        .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
        .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
        .build("DuplicateKey")
    ).toThrow("duplicate metadata key fundEphemeral");
  });
});
