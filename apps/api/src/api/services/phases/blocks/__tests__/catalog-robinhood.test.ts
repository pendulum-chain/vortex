import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, mapFiatToDestination, Networks, RampDirection } from "@vortexfi/shared";
import { config } from "../../../../../config/vars";
import { ROBINHOOD_STOCKS, ROBINHOOD_USDG_ADDRESS } from "../core/robinhood-stocks";
import { getBlockExecutorFlows, resolveBlockFlow, resolvePersistedBlockFlow } from "../flows/catalog";

function buy(inputCurrency: FiatToken, outputCurrency: string) {
  return {
    from: mapFiatToDestination(inputCurrency),
    inputAmount: "100",
    inputCurrency,
    network: Networks.Robinhood,
    outputCurrency: outputCurrency as EvmToken,
    rampType: RampDirection.BUY,
    to: Networks.Robinhood
  };
}

function sell(inputCurrency: string, outputCurrency: FiatToken) {
  return {
    from: Networks.Robinhood,
    inputAmount: "1",
    inputCurrency: inputCurrency as EvmToken,
    network: Networks.Robinhood,
    outputCurrency,
    rampType: RampDirection.SELL,
    to: mapFiatToDestination(outputCurrency)
  };
}

// USDC, USDG and routed symbols are exactly what the structural EVM matchers would otherwise accept.
const NON_STOCKS = [EvmToken.USDC, EvmToken.USDG, EvmToken.ETH, "PAXG"];
const FIATS = [FiatToken.BRL, FiatToken.EURC, FiatToken.USD, FiatToken.MXN, FiatToken.COP, FiatToken.ARS];

describe("existing flows and Robinhood Chain", () => {
  it.each(NON_STOCKS)("no flow delivers %s to Robinhood Chain from any fiat rail", token => {
    for (const fiat of FIATS) {
      expect(() => resolveBlockFlow(buy(fiat, token as string))).toThrow(/No block flow mapped/);
    }
  });

  it.each(NON_STOCKS)("no flow sells %s from Robinhood Chain to any fiat rail", token => {
    for (const fiat of FIATS) {
      expect(() => resolveBlockFlow(sell(token as string, fiat))).toThrow(/No block flow mapped/);
    }
  });

  it("no stock reaches Robinhood Chain outside BRL via Pix", () => {
    for (const fiat of FIATS.filter(fiat => fiat !== FiatToken.BRL)) {
      expect(() => resolveBlockFlow(buy(fiat, EvmToken.NVDA))).toThrow(/No block flow mapped/);
      expect(() => resolveBlockFlow(sell(EvmToken.NVDA, fiat))).toThrow(/No block flow mapped/);
    }
    expect(() => resolveBlockFlow({ ...buy(FiatToken.BRL, EvmToken.NVDA), from: EPaymentMethod.SEPA })).toThrow(
      /No block flow mapped/
    );
    expect(() => resolveBlockFlow({ ...sell(EvmToken.NVDA, FiatToken.BRL), to: EPaymentMethod.SEPA })).toThrow(
      /No block flow mapped/
    );
  });

  it("persisted-only EUR flows do not claim it either", () => {
    const request = sell(EvmToken.USDC, FiatToken.EURC);
    for (const flow of getBlockExecutorFlows().filter(flow => flow.identity.id === "EurOfframpBase")) {
      expect(() =>
        resolvePersistedBlockFlow({
          blocks: Object.fromEntries(flow.contextKeys.map(key => [key, {}])),
          flow: flow.identity,
          globals: { fees: { usd: {} }, partner: null, request }
        })
      ).toThrow(/Unsupported or ambiguous persisted flow/);
    }
  });

  it("keeps the same request shape working on another EVM network", () => {
    const request = { ...buy(FiatToken.BRL, EvmToken.USDC), network: Networks.Arbitrum, to: Networks.Arbitrum };
    expect(resolveBlockFlow(request).name).toBe("BrlOnrampBaseCrossChain");
    expect(resolveBlockFlow({ ...sell("PAXG", FiatToken.BRL), from: Networks.Arbitrum, network: Networks.Arbitrum }).name).toBe(
      "BrlOfframpBase"
    );
  });
});

describe("stock flows", () => {
  const SYMBOLS = Object.keys(ROBINHOOD_STOCKS);
  const PAXOS_USDG = "0x0A3B763d66c0e8c7555c986A3701E1DC1Bf3954F";
  const REJECTED_TOKENS = [
    "AMD",
    "nvda",
    "NVDA.e",
    "__proto__",
    "constructor",
    EvmToken.USDG,
    PAXOS_USDG,
    ROBINHOOD_USDG_ADDRESS,
    ROBINHOOD_STOCKS.NVDA.address
  ];

  it.each(SYMBOLS)("matches exactly one flow for each direction of %s", symbol => {
    expect(resolveBlockFlow(buy(FiatToken.BRL, symbol)).name).toBe("BrlOnrampRobinhoodStock");
    expect(resolveBlockFlow(sell(symbol, FiatToken.BRL)).name).toBe("BrlOfframpRobinhoodStock");
  });

  it.each(REJECTED_TOKENS)("rejects %s in both directions", token => {
    expect(() => resolveBlockFlow(buy(FiatToken.BRL, token))).toThrow(/No block flow mapped/);
    expect(() => resolveBlockFlow(sell(token, FiatToken.BRL))).toThrow(/No block flow mapped/);
  });

  it("rejects the wrong rail with the right fiat, and the wrong fiat with the right rail", () => {
    for (const rail of [EPaymentMethod.SEPA, EPaymentMethod.SPEI, EPaymentMethod.ACH]) {
      expect(() => resolveBlockFlow({ ...buy(FiatToken.BRL, EvmToken.NVDA), from: rail })).toThrow(/No block flow mapped/);
      expect(() => resolveBlockFlow({ ...sell(EvmToken.NVDA, FiatToken.BRL), to: rail })).toThrow(/No block flow mapped/);
    }
    for (const fiat of FIATS.filter(fiat => fiat !== FiatToken.BRL)) {
      expect(() => resolveBlockFlow({ ...buy(fiat, EvmToken.NVDA), from: EPaymentMethod.PIX })).toThrow(/No block flow mapped/);
      expect(() => resolveBlockFlow({ ...sell(EvmToken.NVDA, fiat), to: EPaymentMethod.PIX })).toThrow(/No block flow mapped/);
    }
  });

  it("does not offer a stock symbol on any other network", () => {
    const onArbitrum = { ...buy(FiatToken.BRL, EvmToken.NVDA), network: Networks.Arbitrum, to: Networks.Arbitrum };
    expect(resolveBlockFlow(onArbitrum).name).toBe("BrlOnrampBaseCrossChain");
    const fromArbitrum = { ...sell(EvmToken.NVDA, FiatToken.BRL), from: Networks.Arbitrum, network: Networks.Arbitrum };
    expect(resolveBlockFlow(fromArbitrum).name).toBe("BrlOfframpBase");
  });

  it("matches regardless of the kill switch, so persisted quotes outlive it", () => {
    const { enabledDirections } = config.stocks;
    config.stocks.enabledDirections = [];
    try {
      expect(resolveBlockFlow(buy(FiatToken.BRL, EvmToken.NVDA)).name).toBe("BrlOnrampRobinhoodStock");
      expect(resolveBlockFlow(sell(EvmToken.NVDA, FiatToken.BRL)).name).toBe("BrlOfframpRobinhoodStock");
    } finally {
      config.stocks.enabledDirections = enabledDirections;
    }
  });

  it("leaves other corridors on their flows", () => {
    const base = { ...buy(FiatToken.BRL, EvmToken.USDC), network: Networks.Base, to: Networks.Base };
    expect(resolveBlockFlow(base).name).toBe("BrlOnrampBaseSameChain");
    expect(resolveBlockFlow({ ...sell(EvmToken.USDC, FiatToken.BRL), from: Networks.Base, network: Networks.Base }).name).toBe(
      "BrlOfframpBase"
    );
  });
});
