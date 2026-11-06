import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, isFiatToken, Networks, type RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { formatUnits, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../api/services/phases/blocks/core/robinhood-stocks";
import { priceFeedService } from "../api/services/priceFeed.service";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocksPartner } from "../database/migrations/089-add-stocks-partner";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * The rules below are the Stocks app's own, ported line for line so a real API response can be held against them:
 * `validateStockQuote`, `mapAvailability` and its request builders from `vortex-stocks.js`, `providerCostProblem` from
 * `provider-costs.js`, `parseGasReserve` and `gasReserveFeeProblem` from `gas-reserve.js`, `tokensToWei` from `token.js`.
 * The one rule the API does not meet by design is pinned at the end: the app identifies a token by address, the API by
 * symbol. Every other failure here means the app would refuse our quote.
 */
type RawQuote = Record<string, unknown>;

const DECIMAL = /^\d+(?:\.\d{1,18})?$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const FEE_FIELDS = ["networkFeeFiat", "processingFeeFiat", "partnerFeeFiat", "totalFeeFiat"];
const GAS_RESERVE_FIELDS = ["gasReserveAmount", "gasReserveCurrency", "gasReserveFiat", "gasReserveUsd"];
const GAS_RESERVE_MAX_WEI = parseUnits("0.0003", 18);
const FEE_ROUNDING = 0.01;
const EPSILON = 1e-9;
const NETWORK_UNKNOWN_PATTERN = /Invalid network|Unable to determine network/i;
const DIRECT_PROVIDERS: Array<{ id: string; provider: string }> = [
  { id: "ramp", provider: "avenia" },
  { id: "conversion", provider: "nabla" },
  { id: "bridge", provider: "relay" },
  { id: "swap", provider: "uniswap" },
  { id: "vortex", provider: "vortex" },
  { id: "network", provider: "network" }
];

interface GasReserve {
  brl: number;
  usd: number | null;
}

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
const sameId = (a: unknown, b: unknown) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
const validAmount = (value: unknown) =>
  (typeof value === "number" || typeof value === "string") &&
  String(value).trim() !== "" &&
  /^-?\d+(?:\.\d+)?$/.test(String(value)) &&
  Number.isFinite(Number(value));

function canonicalAmount(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return DECIMAL.test(text) ? formatUnits(parseUnits(text, 18), 18) : null;
}

function tokensToWei(input: unknown): bigint {
  const text = String(input ?? "").trim();
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!text || !match || !(match[1] || match[2])) throw new Error("Informe uma quantidade válida de tokens.");
  const fraction = match[2] || "";
  if (fraction.length > 18) throw new Error("Use no máximo 18 casas decimais.");
  return parseUnits(`${match[1] || "0"}.${fraction || "0"}`, 18);
}

function parseGasReserve(raw: RawQuote): GasReserve | null {
  if (!GAS_RESERVE_FIELDS.some(field => present(raw[field]))) return null;
  const amountText = present(raw.gasReserveAmount) ? String(raw.gasReserveAmount).trim() : "0";
  if (!DECIMAL.test(amountText)) throw new Error("gasReserveAmount is not a plain decimal ETH amount.");
  const wei = parseUnits(amountText, 18);
  const brl = present(raw.gasReserveFiat) ? Number(raw.gasReserveFiat) : wei === 0n ? 0 : Number.NaN;
  if (!Number.isFinite(brl) || brl < 0) throw new Error("gasReserveFiat is missing or not a non-negative number.");
  const usd = present(raw.gasReserveUsd) ? Number(raw.gasReserveUsd) : null;
  if (usd !== null && (!Number.isFinite(usd) || usd < 0)) throw new Error("gasReserveUsd is not a non-negative number.");
  if (wei === 0n) {
    if (brl > 0 || (usd ?? 0) > 0) throw new Error("A gas reserve is charged but no ETH is delivered.");
    return null;
  }
  if (wei > GAS_RESERVE_MAX_WEI) throw new Error("gasReserveAmount is above the most one purchase may deliver.");
  if (raw.gasReserveCurrency !== "ETH") throw new Error("gasReserveCurrency is not ETH.");
  return { brl, usd };
}

function gasReserveFeeProblem(quote: RawQuote, reserve: GasReserve): string | null {
  const network = Number(quote.networkFeeFiat);
  const service = Number(quote.processingFeeFiat) + Number(quote.partnerFeeFiat);
  const total = Number(quote.totalFeeFiat);
  if (reserve.brl > network + FEE_ROUNDING + EPSILON) return "the reserve is not inside networkFeeFiat";
  if (service + network > total + FEE_ROUNDING + EPSILON) return "networkFeeFiat (with the reserve) is not inside totalFeeFiat";
  if (total > service + network + FEE_ROUNDING + EPSILON) return "totalFeeFiat holds more than processing + partner + network";
  if (!(total < Number(quote.inputAmount))) return "the fees, reserve included, are not below the amount paid";
  const networkUsd = present(quote.networkFeeUsd) ? Number(quote.networkFeeUsd) : null;
  if (reserve.usd !== null && networkUsd !== null && Number.isFinite(networkUsd) && reserve.usd > networkUsd + FEE_ROUNDING + EPSILON) {
    return "the reserve is not inside networkFeeUsd";
  }
  return null;
}

function providerCostProblem(raw: RawQuote, reserve: GasReserve | null): string | null {
  if (raw.providerCosts == null) return null;
  if (!validAmount(raw.totalFeeFiat) || Number(raw.totalFeeFiat) < 0) return "invalid-total";
  if (!Array.isArray(raw.providerCosts) || raw.providerCosts.length > DIRECT_PROVIDERS.length) return "invalid-list";
  const costs = raw.providerCosts as Array<{ amountFiat: unknown; id: string; includedIn: string; provider: string }>;
  const seen = new Set<string>();
  let feeSum = 0;
  for (const cost of costs) {
    const expected = DIRECT_PROVIDERS.find(item => item.id === cost?.id);
    if (
      !expected ||
      seen.has(cost.id) ||
      cost.provider !== expected.provider ||
      !validAmount(cost.amountFiat) ||
      !["fees", "rate"].includes(cost.includedIn) ||
      (cost.includedIn === "fees" && Number(cost.amountFiat) < 0)
    ) {
      return "invalid-entry";
    }
    seen.add(cost.id);
    if (cost.includedIn === "fees") feeSum += Number(cost.amountFiat);
  }
  const feeTotal = Number(raw.totalFeeFiat) - (reserve?.brl || 0);
  const feeDifferenceCents = Math.round(feeSum * 100) - Math.round(feeTotal * 100);
  if (feeDifferenceCents > 1) return "fees-exceed-total";
  if (seen.size === DIRECT_PROVIDERS.length && Math.abs(feeDifferenceCents) > 1) return "fees-do-not-reconcile";
  for (const cost of costs) {
    if (["vortex", "network"].includes(cost.id) && cost.includedIn !== "fees") return "invalid-inclusion";
  }
  const vortex = costs.find(cost => cost.id === "vortex");
  if (vortex && raw.vortexFeeFiat != null && (!validAmount(raw.vortexFeeFiat) || Math.abs(Number(vortex.amountFiat) - Number(raw.vortexFeeFiat)) > 0.01)) {
    return "vortex-fee-mismatch";
  }
  return null;
}

/** Throws the app's error code. `id` is what the app pinned the token to. */
function validateStockQuote(
  quote: RawQuote,
  { direction, id, network, now = Date.now(), requested }: { direction: "BUY" | "SELL"; id: string; network: string; now?: number; requested: string }
): void {
  const buy = direction === "BUY";
  const route =
    quote?.rampType === direction &&
    quote.network === network &&
    quote.from === (buy ? "pix" : network) &&
    quote.to === (buy ? network : "pix") &&
    (buy ? quote.inputCurrency === "BRL" && sameId(quote.outputCurrency, id) : sameId(quote.inputCurrency, id) && quote.outputCurrency === "BRL");
  if (!route) throw new Error("WRONG_ROUTE");
  if (quote.routingStrategy !== "direct") throw new Error("WRONG_ROUTE");
  const expiresAt = Date.parse(String(quote.expiresAt));
  const tokenAmount = canonicalAmount(buy ? quote.outputAmount : quote.inputAmount);
  const output = Number(quote.outputAmount);
  if (!quote.id || !Number.isFinite(output) || output <= 0 || !Number.isFinite(expiresAt) || expiresAt <= now || tokenAmount === null) {
    throw new Error("INVALID_QUOTE");
  }
  for (const field of FEE_FIELDS) {
    const value = quote[field];
    if (value == null || String(value).trim() === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error("INVALID_FEES");
    }
  }
  const componentTotal = Number(quote.networkFeeFiat) + Number(quote.processingFeeFiat) + Number(quote.partnerFeeFiat);
  if (Math.abs(componentTotal - Number(quote.totalFeeFiat)) > 0.010000001 || (buy && Number(quote.totalFeeFiat) >= Number(quote.inputAmount))) {
    throw new Error("INVALID_FEES");
  }
  if (quote.feeCurrency !== "BRL") throw new Error("INVALID_FEES");
  if (Number(quote.partnerFeeFiat) !== 0) throw new Error("INVALID_FEES");
  let reserve: GasReserve | null;
  try {
    reserve = parseGasReserve(quote);
  } catch {
    throw new Error("INVALID_FEES");
  }
  if (reserve && (!buy || gasReserveFeeProblem(quote, reserve))) throw new Error("INVALID_FEES");
  if (providerCostProblem(quote, reserve)) throw new Error("INVALID_FEES");
  let matches: boolean;
  if (buy) {
    matches = Number(quote.inputAmount) === Number(requested);
  } else {
    try {
      matches = parseUnits(tokenAmount, 18) === tokensToWei(requested);
    } catch {
      matches = false;
    }
  }
  if (!matches) throw new Error("AMOUNT_MISMATCH");
}

function mapAvailability(
  response: { cryptocurrencies: Array<Record<string, unknown>> },
  tokens: Array<{ address: string; symbol: string }>
): Record<string, { buy: boolean; reason: string | null; sell: boolean }> {
  const list = response.cryptocurrencies;
  const map: Record<string, { buy: boolean; reason: string | null; sell: boolean }> = {};
  for (const token of tokens) {
    const listed = list.find(
      item => item.assetNetwork === "robinhood" && sameId(item.assetContractAddress, token.address) && item.assetDecimals === 18
    );
    if (listed) {
      const rampTypes = listed.rampTypes as string[] | undefined;
      const buy = rampTypes?.includes("BUY") === true;
      const sell = rampTypes?.includes("SELL") === true;
      map[token.symbol] = { buy, reason: buy || sell ? null : "token_not_listed", sell };
    } else if (list.some(item => item.assetNetwork === "robinhood" && String(item.assetSymbol || "").toUpperCase() === token.symbol)) {
      map[token.symbol] = { buy: false, reason: "address_mismatch", sell: false };
    } else {
      map[token.symbol] = { buy: false, reason: "token_not_listed", sell: false };
    }
  }
  return map;
}

function buildStockBuyRequest(outputId: string, brlAmount: string, destinationAddress: string | null = null) {
  const request = {
    countryCode: "BR",
    from: "pix",
    inputAmount: String(brlAmount),
    inputCurrency: "BRL",
    network: Networks.Robinhood,
    outputCurrency: outputId,
    paymentMethod: "pix",
    rampType: "BUY",
    to: Networks.Robinhood
  };
  return EVM_ADDRESS.test(String(destinationAddress ?? "")) ? { ...request, destinationAddress } : request;
}

function buildStockSellRequest(inputId: string, tokenAmount: string) {
  return {
    countryCode: "BR",
    from: Networks.Robinhood,
    inputAmount: tokenAmount,
    inputCurrency: inputId,
    network: Networks.Robinhood,
    outputCurrency: "BRL",
    paymentMethod: "pix",
    rampType: "SELL",
    to: "pix"
  };
}

const STOCK_SYMBOLS = Object.keys(ROBINHOOD_STOCKS) as StockSymbol[];
const NVDA_USD = 181n;

describe("the Stocks app's rules, held against real quote responses", () => {
  let world: FakeWorld;
  let app: TestApp;
  const enabledDirections = config.stocks.enabledDirections;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    await resetTestDatabase();
    await seedStocksPartner(sequelize.getQueryInterface());
    // The app sees the real feed's format: fiat in cents, the rest in 8 decimals. The fake alone does not round.
    const fakeConvert = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = async (
      amount: string,
      from: RampCurrency,
      to: RampCurrency,
      decimals?: number | null,
      network?: Networks
    ) => new Big(await fakeConvert(amount, from, to, null, network)).toFixed(decimals ?? (isFiatToken(to) ? 2 : 8));
    app = await startTestApp();
  });

  afterAll(async () => {
    config.stocks.enabledDirections = enabledDirections;
    await app?.close();
    world?.restore();
  });

  beforeEach(() => {
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      const amountIn = params.args?.[0] as bigint;
      return amountIn >= 10n ** 18n ? amountIn / 5n / 10n ** 12n : amountIn * 5n * 10n ** 12n;
    };
    scriptRobinhoodChain(world.evm, NVDA_USD);
  });

  const wallet = () => privateKeyToAccount(generatePrivateKey()).address;

  async function postQuote(body: Record<string, unknown>) {
    return app.request("/v1/quotes", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  }

  async function quoteFor(body: Record<string, unknown>): Promise<RawQuote> {
    const response = await postQuote(body);
    expect(response.status, `quote creation failed: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as RawQuote;
  }

  const expectedBuy = (id: string, requested: string) => ({ direction: "BUY" as const, id, network: Networks.Robinhood, requested });
  const expectedSell = (id: string, requested: string) => ({ direction: "SELL" as const, id, network: Networks.Robinhood, requested });

  describe("quotes the app accepts", () => {
    it.each(["100", "137", "500", "1234", "4999"])("BUY of %s BRL", async amount => {
      const quote = await quoteFor(buildStockBuyRequest(EvmToken.NVDA, amount));

      validateStockQuote(quote, expectedBuy(EvmToken.NVDA, amount));
      expect(parseGasReserve(quote)).not.toBeNull();
      expect(quote.gasless).toBeUndefined();
    });

    it.each(["0.5", "0.123456789012345678", "1.000000000000000003", "3", "12.5"])("SELL of %s tokens", async amount => {
      const quote = await quoteFor(buildStockSellRequest(EvmToken.NVDA, amount));

      validateStockQuote(quote, expectedSell(EvmToken.NVDA, amount));
      expect(parseGasReserve(quote)).toBeNull();
      expect(quote.gasless).toBe(true);
    });

    it.each(STOCK_SYMBOLS)("%s in both directions", async symbol => {
      validateStockQuote(await quoteFor(buildStockBuyRequest(symbol, "250")), expectedBuy(symbol, "250"));
      validateStockQuote(await quoteFor(buildStockSellRequest(symbol, "0.5")), expectedSell(symbol, "0.5"));
    });

    it("BUY topping up a wallet with some ETH left", async () => {
      const destination = wallet();
      world.evm.setNativeBalance(Networks.Robinhood, destination, config.stocks.gasReserveThresholdWei - 1n);

      const quote = await quoteFor(buildStockBuyRequest(EvmToken.NVDA, "500", destination));

      validateStockQuote(quote, expectedBuy(EvmToken.NVDA, "500"));
      expect(parseGasReserve(quote)).not.toBeNull();
    });

    it("BUY for a wallet that needs no reserve", async () => {
      const destination = wallet();
      world.evm.setNativeBalance(Networks.Robinhood, destination, config.stocks.gasReserveThresholdWei);

      const quote = await quoteFor(buildStockBuyRequest(EvmToken.NVDA, "500", destination));

      validateStockQuote(quote, expectedBuy(EvmToken.NVDA, "500"));
      expect(parseGasReserve(quote)).toBeNull();
    });

    it.each([
      ["BUY", () => buildStockBuyRequest(EvmToken.NVDA, "500"), expectedBuy(EvmToken.NVDA, "500")],
      ["SELL", () => buildStockSellRequest(EvmToken.NVDA, "0.5"), expectedSell(EvmToken.NVDA, "0.5")]
    ])("%s read back with GET /quotes/:id", async (_label, body, expected) => {
      const { id } = await quoteFor(body());

      validateStockQuote((await (await app.request(`/v1/quotes/${id}`)).json()) as RawQuote, expected);
    });

    it("reconciles the fee rows to the cent, in the real feed's format", async () => {
      for (const amount of ["100", "137", "1234"]) {
        const quote = await quoteFor(buildStockBuyRequest(EvmToken.NVDA, amount));
        const costs = quote.providerCosts as Array<{ amountFiat: string; includedIn: string }>;
        const feeCents = costs.filter(row => row.includedIn === "fees").reduce((sum, row) => sum + Math.round(Number(row.amountFiat) * 100), 0);

        expect(feeCents).toBe(Math.round((Number(quote.totalFeeFiat) - Number(quote.gasReserveFiat)) * 100));
        expect(quote.gasReserveFiat).toMatch(/^\d+\.\d{2}$/);
        expect(quote.partnerFeeFiat).toBe("0.00");
      }
    });
  });

  describe("a port that still bites: each broken quote is refused the way the app would", () => {
    const buy = () => quoteFor(buildStockBuyRequest(EvmToken.NVDA, "500"));
    const sell = () => quoteFor(buildStockSellRequest(EvmToken.NVDA, "0.5"));
    const editCost = (quote: RawQuote, id: string, change: Record<string, unknown>) =>
      (quote.providerCosts as Array<{ id: string }>).map(row => (row.id === id ? { ...row, ...change } : row));

    it.each<[string, () => Promise<RawQuote>, (quote: RawQuote) => RawQuote, string]>([
      ["no route marker", buy, quote => ({ ...quote, routingStrategy: undefined }), "WRONG_ROUTE"],
      ["another network", buy, quote => ({ ...quote, network: "base" }), "WRONG_ROUTE"],
      ["an expired quote", buy, quote => ({ ...quote, expiresAt: new Date(Date.now() - 1000).toISOString() }), "INVALID_QUOTE"],
      ["an exponent in the output", buy, quote => ({ ...quote, outputAmount: "1e-3" }), "INVALID_QUOTE"],
      ["a total off by two cents", buy, quote => ({ ...quote, totalFeeFiat: String(Number(quote.totalFeeFiat) + 0.02) }), "INVALID_FEES"],
      ["fees in another currency", buy, quote => ({ ...quote, feeCurrency: "USD" }), "INVALID_FEES"],
      ["a partner fee", buy, quote => ({ ...quote, partnerFeeFiat: "0.01" }), "INVALID_FEES"],
      ["a reserve in another currency", buy, quote => ({ ...quote, gasReserveCurrency: "BTC" }), "INVALID_FEES"],
      ["a reserve above the app's maximum", buy, quote => ({ ...quote, gasReserveAmount: "0.0004" }), "INVALID_FEES"],
      ["a reserve outside the network fee", buy, quote => ({ ...quote, gasReserveFiat: String(Number(quote.networkFeeFiat) + 1) }), "INVALID_FEES"],
      ["a reserve on a sell", sell, quote => ({ ...quote, gasReserveAmount: "0.00005", gasReserveCurrency: "ETH", gasReserveFiat: "0.01" }), "INVALID_FEES"],
      ["a negative fee row", buy, quote => ({ ...quote, providerCosts: editCost(quote, "ramp", { amountFiat: "-0.01" }) }), "INVALID_FEES"],
      ["fee rows above the total", buy, quote => ({ ...quote, providerCosts: editCost(quote, "network", { amountFiat: String(Number(quote.networkFeeFiat) + 5) }) }), "INVALID_FEES"],
      ["a network row hidden in the rate", buy, quote => ({ ...quote, providerCosts: editCost(quote, "network", { includedIn: "rate" }) }), "INVALID_FEES"],
      ["a vortex row off the vortex fee", buy, quote => ({ ...quote, vortexFeeFiat: String(Number(quote.vortexFeeFiat) + 1) }), "INVALID_FEES"],
      ["another bridge provider", buy, quote => ({ ...quote, providerCosts: editCost(quote, "bridge", { provider: "lifi" }) }), "INVALID_FEES"],
      ["another amount paid", buy, quote => ({ ...quote, inputAmount: "501" }), "AMOUNT_MISMATCH"],
      ["a sell amount one wei off", sell, quote => ({ ...quote, inputAmount: "0.500000000000000001" }), "AMOUNT_MISMATCH"]
    ])("%s", async (_label, make, breakIt, code) => {
      const quote = await make();
      const expected = quote.rampType === "BUY" ? expectedBuy(EvmToken.NVDA, "500") : expectedSell(EvmToken.NVDA, "0.5");

      validateStockQuote(quote, expected);
      expect(() => validateStockQuote(breakIt(quote), expected)).toThrow(code);
    });
  });

  describe("availability", () => {
    const appTokens = STOCK_SYMBOLS.map(symbol => ({ address: ROBINHOOD_STOCKS[symbol].address, symbol }));
    const listing = async () => (await (await app.request("/v1/supported-cryptocurrencies?network=robinhood")).json()) as { cryptocurrencies: Array<Record<string, unknown>> };

    it("lists every token the app knows, on its address, in both directions", async () => {
      const availability = mapAvailability(await listing(), appTokens);

      for (const { symbol } of appTokens) expect(availability[symbol]).toEqual({ buy: true, reason: null, sell: true });
    });

    it("shows the app no direction that is switched off", async () => {
      config.stocks.enabledDirections = [RampDirection.BUY];

      const availability = mapAvailability(await listing(), appTokens);

      for (const { symbol } of appTokens) expect(availability[symbol]).toEqual({ buy: true, reason: null, sell: false });
    });

    it("answers a quote with the app's coming-soon error when the corridor is off", async () => {
      config.stocks.enabledDirections = [];

      const response = await postQuote(buildStockBuyRequest(EvmToken.NVDA, "500"));

      expect(response.status).toBe(400);
      expect(((await response.json()) as { message: string }).message).toMatch(NETWORK_UNKNOWN_PATTERN);
    });
  });

  describe("what the app cannot accept yet: the token id", () => {
    const nvdaAddress = ROBINHOOD_STOCKS[EvmToken.NVDA as StockSymbol].address;

    it("refuses our symbol while it pins the quote to the address", async () => {
      const buy = await quoteFor(buildStockBuyRequest(EvmToken.NVDA, "500"));
      const sell = await quoteFor(buildStockSellRequest(EvmToken.NVDA, "0.5"));

      expect(buy.outputCurrency).toBe(EvmToken.NVDA);
      expect(sell.inputCurrency).toBe(EvmToken.NVDA);
      expect(() => validateStockQuote(buy, expectedBuy(nvdaAddress, "500"))).toThrow("WRONG_ROUTE");
      expect(() => validateStockQuote(sell, expectedSell(nvdaAddress, "0.5"))).toThrow("WRONG_ROUTE");
    });

    it("gets the allowlist error for a request that names the address", async () => {
      const responses = await Promise.all([
        postQuote(buildStockBuyRequest(nvdaAddress, "500")),
        postQuote(buildStockSellRequest(nvdaAddress, "0.5"))
      ]);

      for (const response of responses) expect(response.status).toBe(400);
    });
  });
});
