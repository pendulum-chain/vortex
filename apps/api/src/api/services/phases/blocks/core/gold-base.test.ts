import { afterEach, describe, expect, it } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getEvmTokenConfig,
  getOnChainTokenDetails,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import { config } from "../../../../../config/vars";
import { resolveBlockFlow } from "../flows/catalog";
import {
  BASE_PAXG_ADDRESS,
  GOLD_TOKEN,
  isBaseUsdcGoldRoute,
  isBrlPixGoldRoute,
  isGoldBaseRoute,
  isGoldRouteEnabled
} from "./gold-base";

const paxg = GOLD_TOKEN as EvmToken;
const pixBuy = {
  from: EPaymentMethod.PIX,
  inputCurrency: FiatToken.BRL,
  outputCurrency: paxg,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const pixSell = {
  from: Networks.Base,
  inputCurrency: paxg,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};
const usdcBuy = {
  from: Networks.Base,
  inputCurrency: EvmToken.USDC,
  outputCurrency: paxg,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const usdcSell = {
  from: Networks.Base,
  inputCurrency: paxg,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.SELL,
  to: Networks.Base
};

describe("PAXG on Base", () => {
  const { enabledDirections, usdcEnabledDirections } = config.gold;

  afterEach(() => {
    config.gold.enabledDirections = enabledDirections;
    config.gold.usdcEnabledDirections = usdcEnabledDirections;
  });

  it("resolves in this process without entering the shared static config", () => {
    expect(evmTokenConfig[Networks.Base]).not.toHaveProperty(GOLD_TOKEN);
    expect(getEvmTokenConfig()[Networks.Base][GOLD_TOKEN]).toMatchObject({
      assetSymbol: GOLD_TOKEN,
      decimals: 18,
      erc20AddressSourceChain: BASE_PAXG_ADDRESS,
      isNative: false,
      network: Networks.Base
    });
    expect(getOnChainTokenDetails(Networks.Base, paxg, getEvmTokenConfig())).toMatchObject({
      erc20AddressSourceChain: BASE_PAXG_ADDRESS
    });
  });

  it("recognizes the four Gold routes and tells the rails apart", () => {
    for (const route of [pixBuy, pixSell, usdcBuy, usdcSell]) expect(isGoldBaseRoute(route)).toBe(true);
    expect([pixBuy, pixSell].every(isBrlPixGoldRoute)).toBe(true);
    expect([usdcBuy, usdcSell].some(isBrlPixGoldRoute)).toBe(false);
    expect([usdcBuy, usdcSell].every(isBaseUsdcGoldRoute)).toBe(true);
    expect([pixBuy, pixSell].some(isBaseUsdcGoldRoute)).toBe(false);
    // A lower-case symbol resolves to the same token, so it is the same route.
    expect(isGoldBaseRoute({ ...pixBuy, outputCurrency: "paxg" as EvmToken })).toBe(true);
  });

  it("leaves PAXG on other networks and other Base tokens to the generic flows", () => {
    expect(isGoldBaseRoute({ ...pixBuy, to: Networks.Ethereum })).toBe(false);
    expect(isGoldBaseRoute({ ...pixSell, from: Networks.Ethereum })).toBe(false);
    expect(isGoldBaseRoute({ ...pixBuy, outputCurrency: EvmToken.USDC })).toBe(false);
    // The token paid with, not the token traded.
    expect(isGoldBaseRoute({ ...usdcBuy, inputCurrency: paxg, outputCurrency: EvmToken.USDC })).toBe(false);
  });

  it("is off in both directions on both rails until its switch names the direction", () => {
    for (const route of [pixBuy, pixSell, usdcBuy, usdcSell]) expect(isGoldRouteEnabled(route)).toBe(false);

    config.gold.enabledDirections = [RampDirection.BUY];
    expect([pixBuy, pixSell, usdcBuy, usdcSell].map(isGoldRouteEnabled)).toEqual([true, false, false, false]);

    config.gold.enabledDirections = [];
    config.gold.usdcEnabledDirections = [RampDirection.SELL];
    expect([pixBuy, pixSell, usdcBuy, usdcSell].map(isGoldRouteEnabled)).toEqual([false, false, false, true]);
  });

  it("never enables a Gold request on another rail, whatever the switches say", () => {
    config.gold.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    config.gold.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    expect(isGoldRouteEnabled({ ...pixBuy, from: EPaymentMethod.SEPA, inputCurrency: FiatToken.EURC })).toBe(false);
    expect(isGoldRouteEnabled({ ...usdcBuy, inputCurrency: EvmToken.USDT })).toBe(false);
    expect(isGoldRouteEnabled({ ...usdcSell, to: Networks.Ethereum })).toBe(false);
  });

  it("is not picked up by the generic BRL flows, which would route it through Squid", () => {
    const request = { inputAmount: "1", network: Networks.Base };
    expect(() => resolveBlockFlow({ ...request, ...pixBuy })).toThrow(/No block flow mapped/);
    expect(() => resolveBlockFlow({ ...request, ...pixSell })).toThrow(/No block flow mapped/);
    // PAXG on Ethereum keeps its routed flows.
    expect(resolveBlockFlow({ ...request, ...pixSell, from: Networks.Ethereum, network: Networks.Ethereum }).name).toBe(
      "BrlOfframpBase"
    );
    expect(resolveBlockFlow({ ...request, ...pixBuy, network: Networks.Ethereum, to: Networks.Ethereum }).name).toBe(
      "BrlOnrampBaseCrossChain"
    );
    // Other Base tokens are untouched.
    expect(resolveBlockFlow({ ...request, ...pixSell, inputCurrency: EvmToken.USDC }).name).toBe("BrlOfframpBase");
  });
});
