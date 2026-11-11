import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, isFiatToken, Networks, type RampCurrency, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { InsufficientBalanceError, parseAPIError } from "../../../../packages/sdk/src/errors";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { parseGasReserve } from "../../../stocks/src/lib/gas-reserve.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { NETWORK_UNKNOWN_PATTERN, rampOpenState } from "../../../stocks/src/lib/ramp-contract.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { STOCK_TOKENS } from "../../../stocks/src/lib/stocks.js";
import {
  buildStockBuyRequest as appBuyRequest,
  buildStockSellRequest as appSellRequest,
  createVortexStocksAdapter,
  mapAvailability,
  mapStocksError,
  validateStockQuote
  // @ts-expect-error The Stocks app is plain JavaScript without declarations.
} from "../../../stocks/src/lib/vortex-stocks.js";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../api/services/phases/blocks/core/robinhood-stocks";
import { priceFeedService } from "../api/services/priceFeed.service";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocksPartner } from "../database/migrations/089-add-stocks-partner";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/** The Stocks app's own code, held against real API responses. Any failure here means the app would refuse our answer. */
type RawQuote = Record<string, unknown>;
type Expected = { direction: "BUY" | "SELL"; id: string; network: Networks; requested: string };

const buildStockBuyRequest = (outputId: string, brlAmount: string, destinationAddress: string | null = null) =>
  appBuyRequest({ brlAmount, destinationAddress, network: Networks.Robinhood, outputId });
const buildStockSellRequest = (inputId: string, tokenAmount: string) =>
  appSellRequest({ inputId, network: Networks.Robinhood, tokenAmount });

/** The error code the app answers a quote with, or null when it accepts the quote. */
function refusal(quote: RawQuote, expected: Expected): string | null {
  try {
    validateStockQuote(quote, expected);
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
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

  const expectedBuy = (id: string, requested: string): Expected => ({ direction: "BUY", id, network: Networks.Robinhood, requested });
  const expectedSell = (id: string, requested: string): Expected => ({ direction: "SELL", id, network: Networks.Robinhood, requested });

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

  describe("each broken quote is refused the way the app would", () => {
    const buy = () => quoteFor(buildStockBuyRequest(EvmToken.NVDA, "500"));
    const sell = () => quoteFor(buildStockSellRequest(EvmToken.NVDA, "0.5"));
    const editCost = (quote: RawQuote, id: string, change: Record<string, unknown>) =>
      (quote.providerCosts as Array<{ id: string }>).map(row => (row.id === id ? { ...row, ...change } : row));

    it.each<[string, () => Promise<RawQuote>, (quote: RawQuote) => RawQuote, string]>([
      ["no route marker", buy, quote => ({ ...quote, routingStrategy: undefined }), "WRONG_ROUTE"],
      ["another network", buy, quote => ({ ...quote, network: "base" }), "WRONG_ROUTE"],
      ["a sell without a permit", sell, quote => ({ ...quote, gasless: false }), "WRONG_ROUTE"],
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

      expect(refusal(quote, expected)).toBeNull();
      expect(refusal(breakIt(quote), expected)).toBe(code);
    });
  });

  describe("availability", () => {
    const listing = async () => (await (await app.request("/v1/supported-cryptocurrencies?network=robinhood")).json()) as { cryptocurrencies: Array<Record<string, unknown>> };
    const availability = async () => mapAvailability(await listing(), { network: Networks.Robinhood, tokens: STOCK_TOKENS });

    it("lists every token the app knows, on the address it bundles, in both directions", async () => {
      const map = await availability();

      expect(Object.keys(map)).toHaveLength(STOCK_SYMBOLS.length);
      for (const symbol of STOCK_SYMBOLS) expect(map[symbol]).toEqual({ buy: true, reason: null, sell: true });
    });

    it("shows the app no direction that is switched off", async () => {
      config.stocks.enabledDirections = [RampDirection.BUY];

      const map = await availability();

      for (const symbol of STOCK_SYMBOLS) expect(map[symbol]).toEqual({ buy: true, reason: null, sell: false });
    });

    it("reads as the app's coming-soon state when the corridor is off", async () => {
      config.stocks.enabledDirections = [];

      const map = await availability();

      for (const symbol of STOCK_SYMBOLS) expect(map[symbol]).toEqual({ buy: false, reason: "not_enabled", sell: false });
      expect(rampOpenState({ rampEnabled: true, rampKind: "vortex" }, map)).toBe(false);
    });

    it("answers a quote with the app's coming-soon error when the corridor is off", async () => {
      config.stocks.enabledDirections = [];

      const response = await postQuote(buildStockBuyRequest(EvmToken.NVDA, "500"));

      expect(response.status).toBe(400);
      expect(((await response.json()) as { message: string }).message).toMatch(NETWORK_UNKNOWN_PATTERN);
    });
  });

  describe("the app's adapter against the API", () => {
    // The two things the SDK does to a quote call: post it, and turn a failure into its own error class.
    const client = {
      async createQuote(request: Record<string, unknown>) {
        const response = await postQuote(request);
        if (!response.ok) throw parseAPIError(await response.json(), response.status);
        return response.json();
      }
    };
    const adapter = () =>
      createVortexStocksAdapter({
        activeRampStore: {},
        apiBase: app.baseUrl,
        createClient: async () => client,
        enabled: true,
        ephemeralStore: {},
        kyc: {},
        network: Networks.Robinhood,
        readMaintenance: async () => ({ active: false, details: null }),
        session: {}
      });
    const nvdaAddress = ROBINHOOD_STOCKS[EvmToken.NVDA as StockSymbol].address;

    it.each(STOCK_SYMBOLS)("quotes %s by symbol in both directions, and the app accepts the answer", async symbol => {
      const buy = await adapter().quoteBuy({ brlAmount: 250, symbol, walletAddress: wallet() });
      const sell = await adapter().quoteSell({ symbol, tokenAmount: "0.5" });

      expect(buy.rawQuote.outputCurrency).toBe(symbol);
      expect(sell.rawQuote.inputCurrency).toBe(symbol);
      expect(buy.tokenAddress).toBe(ROBINHOOD_STOCKS[symbol].address);
      expect(sell.tokenAddress).toBe(ROBINHOOD_STOCKS[symbol].address);
      expect(sell.gasless).toBe(true);
    });

    it("a request that names the address gets the allowlist error, in Portuguese", async () => {
      const responses = await Promise.all([
        postQuote(buildStockBuyRequest(nvdaAddress, "500")),
        postQuote(buildStockSellRequest(nvdaAddress, "0.5"))
      ]);

      for (const response of responses) {
        expect(response.status).toBe(400);
        const mapped = mapStocksError(parseAPIError(await response.json(), response.status));
        expect(mapped.code).toBe("TOKEN_NOT_ALLOWED");
        expect(mapped.message).toBe("Este token não está disponível aqui.");
      }
    });

    it("a switched-off corridor stays the coming-soon error through the SDK's rewrite", async () => {
      config.stocks.enabledDirections = [];

      await expect(adapter().quoteBuy({ brlAmount: 500, symbol: "NVDA" })).rejects.toMatchObject({ code: "NETWORK_NOT_SUPPORTED" });
    });

    it("a token the issuer paused answers in Portuguese", async () => {
      const scripted = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) =>
        params.functionName === "paused" && params.address === nvdaAddress ? true : scripted?.(network, params);

      await expect(adapter().quoteBuy({ brlAmount: 500, symbol: "NVDA" })).rejects.toMatchObject({
        code: "TOKEN_UNAVAILABLE",
        message: "Negociação pausada pelo emissor. Tente novamente mais tarde.",
        status: 503
      });
    });

    it("an amount below the corridor's minimum answers in Portuguese, with the limit", async () => {
      await expect(adapter().quoteBuy({ brlAmount: 1, symbol: "NVDA" })).rejects.toMatchObject({
        code: "INVALID_QUOTE",
        message: expect.stringMatching(/^O valor desta operação precisa ser de pelo menos R\$\s[\d.,]+\.$/)
      });
    });

    // As the API sends them, so the SDK's rewrites of some of them are part of the check.
    it.each<[Record<string, unknown>, number, string]>([
      [{ message: "Invalid pixKey or receiverTaxId." }, 400, "chave Pix"],
      [{ message: "Amount exceeds BRL limit." }, 400, "limite"],
      [{ message: "Amount exceeds global limit." }, 400, "limite"],
      [{ error: "Amount exceeds limit" }, 400, "limite"],
      [{ message: "Quote not found" }, 404, "cotação"],
      [{ message: "Quote has expired" }, 400, "cotação"],
      [{ message: "Quote already consumed" }, 409, "cotação"],
      [{ message: "Quote is consumed" }, 400, "cotação"],
      [{ error: "No completed provider profile found for this API key user." }, 400, "verificação"],
      [{ error: "Subaccount not found" }, 404, "verificação"],
      [{ message: "Subaccount not found." }, 400, "verificação"],
      [{ error: "KYC invalid" }, 400, "verificação"],
      [{ message: "Ramp not found" }, 404, "não foi encontrada"],
      [{ message: "Ramp is not in a state that allows starting" }, 409, "não pode ser alterada"],
      [{ message: "No presigned transactions found. Please call updateRamp first." }, 400, "não foi concluído"],
      [{ message: "Maximum time window to start process exceeded. Ramp invalidated." }, 400, "prazo"]
    ])("%j reaches the UI in Portuguese", (body, status, wording) => {
      expect(mapStocksError(parseAPIError(body, status)).message).toContain(wording);
    });

    it("the SDK's own balance check keeps its meaning", () => {
      expect(mapStocksError(new InsufficientBalanceError("0.5", "NVDA", Networks.Robinhood, wallet())).code).toBe("INSUFFICIENT_BALANCE");
    });
  });
});
