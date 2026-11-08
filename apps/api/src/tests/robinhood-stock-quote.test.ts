import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type CreateQuoteRequest,
  EvmToken,
  FiatToken,
  Networks,
  type ProviderCost,
  QuoteError,
  type QuoteResponse,
  RampDirection,
  type UnsignedTx
} from "@vortexfi/shared";
import { type Abi, ContractFunctionExecutionError, ContractFunctionZeroDataError, formatEther, HttpRequestError, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { runBlockQuoteFlow } from "../api/services/phases/blocks/core/quote";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../api/services/phases/blocks/core/robinhood-stocks";
import { createQuoteContext } from "../api/services/quote/core/quote-context";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocksPartner } from "../database/migrations/089-add-stocks-partner";
import Partner from "../models/partner.model";
import PartnerPricingConfig from "../models/partnerPricingConfig.model";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestPartner, createTestTaxId, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const NVDA_USD = 181n;
const ETH_USD = 2500;
const PIX_KEY = "pix-key@example.com";
const TAX_ID = "12345678901";
// What the fake Avenia reports as the owner of any Pix key.
const RECEIVER_TAX_ID = "12345678900";
const USDC_ON_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const GAS_RESERVE_FIELDS = ["gasReserveAmount", "gasReserveCurrency", "gasReserveFiat", "gasReserveUsd"];
// A response is byte-identical to before the stock corridor only if these stay in this order, with nothing added.
const EXISTING_CORRIDOR_RESPONSE_KEYS = [
  "anchorFeeFiat",
  "anchorFeeUsd",
  "createdAt",
  "expiresAt",
  "feeCurrency",
  "from",
  "id",
  "inputAmount",
  "inputCurrency",
  "network",
  "networkFeeFiat",
  "networkFeeUsd",
  "outputAmount",
  "outputCurrency",
  "partnerFeeFiat",
  "partnerFeeUsd",
  "paymentMethod",
  "processingFeeFiat",
  "processingFeeUsd",
  "rampType",
  "to",
  "totalFeeFiat",
  "totalFeeUsd",
  "vortexFeeFiat",
  "vortexFeeUsd"
];

const buyBody = {
  from: "pix",
  inputAmount: "500",
  inputCurrency: FiatToken.BRL,
  network: Networks.Robinhood,
  outputCurrency: EvmToken.NVDA,
  rampType: RampDirection.BUY,
  to: Networks.Robinhood
};
const sellBody = {
  from: Networks.Robinhood,
  inputAmount: "0.5",
  inputCurrency: EvmToken.NVDA,
  network: Networks.Robinhood,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: "pix"
};

describe("Robinhood Chain stock quotes, end to end", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let app: TestApp;
  const enabledDirections = config.stocks.enabledDirections;

  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    config.stocks.enabledDirections = enabledDirections;
    await app?.close();
    auth?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocksPartner(sequelize.getQueryInterface());
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.squidRouter.toTokenDecimals = 6;
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      const amountIn = params.args?.[0] as bigint;
      const fromUsdc = (params.args?.[1] as string[])[0].toLowerCase() === USDC_ON_BASE;
      return fromUsdc ? amountIn * 5n * 10n ** 12n : amountIn / 5n / 10n ** 12n;
    };
    scriptRobinhoodChain(world.evm, NVDA_USD);
  });

  async function postQuote(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return app.request("/v1/quotes", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
      method: "POST"
    });
  }

  async function createQuote(body: Record<string, unknown>, headers?: Record<string, string>) {
    const response = await postQuote(body, headers);
    expect(response.status, `quote creation failed: ${await response.clone().text()}`).toBe(201);
    const quote = (await response.json()) as QuoteResponse & { id: string };
    const ticket = await QuoteTicket.findByPk(quote.id);
    if (!ticket) throw new Error("quote was not persisted");
    return { quote, ticket };
  }

  const wallet = () => privateKeyToAccount(generatePrivateKey()).address;
  async function register(quoteId: string, additionalData: Record<string, unknown>) {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    return app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { taxId: TAX_ID, ...additionalData },
        quoteId,
        signingAccounts: [{ address: wallet(), type: "EVM" }]
      }),
      headers: { Authorization: `Bearer ${testUserToken(user.id)}`, "Content-Type": "application/json" },
      method: "POST"
    });
  }

  const stocksPartner = async () => (await Partner.findOne({ where: { name: "vortex-stocks" } })) as Partner;
  const metadataOf = (ticket: QuoteTicket) =>
    ticket.metadata as unknown as {
      blocks: Record<string, { amountRaw?: string; quotedFor?: string; token?: string }>;
      flow: { id: string };
      globals: { gasReserve?: { amountRaw: string; quotedFor?: string; usd: string }; request: { destinationAddress?: string } };
    };

  it("limits stock quotes per address, without counting other quotes", async () => {
    const limit = config.stocks.quoteRateLimitPerMinute;
    config.stocks.quoteRateLimitPerMinute = 2;
    try {
      const from = { "X-Forwarded-For": "203.0.113.7" };
      const statuses: number[] = [];
      for (const body of [buyBody, sellBody, buyBody]) statuses.push((await postQuote(body, from)).status);
      expect(statuses).toEqual([201, 201, 429]);

      const otherQuote = { ...buyBody, network: Networks.Polygon, outputCurrency: EvmToken.USDC, to: Networks.Polygon };
      expect((await postQuote(otherQuote, from)).status).not.toBe(429);
      expect((await postQuote(buyBody, { "X-Forwarded-For": "203.0.113.8" })).status).toBe(201);
    } finally {
      config.stocks.quoteRateLimitPerMinute = limit;
    }
  });

  describe("route pricing", () => {
    it.each([
      ["BUY", buyBody, "BrlOnrampRobinhoodStock", "0.25"],
      ["SELL", sellBody, "BrlOfframpRobinhoodStock", "0.23"]
    ] as const)("prices an anonymous %s from the stocks partner, without an owner", async (_label, body, flowId, vortexFee) => {
      const { quote, ticket } = await createQuote(body);

      expect(metadataOf(ticket).flow.id).toBe(flowId);
      expect(ticket.partnerId).toBeNull();
      expect(ticket.pricingPartnerId).toBe((await stocksPartner()).id);
      expect(quote.vortexFeeFiat).toBe(vortexFee);
    });

    it("prices a Bearer user from the stocks partner too, and leaves the quote theirs", async () => {
      const user = await createTestUser();
      const { ticket } = await createQuote(buyBody, { Authorization: `Bearer ${testUserToken(user.id)}` });

      expect(ticket.partnerId).toBeNull();
      expect(ticket.userId).toBe(user.id);
      expect(ticket.pricingPartnerId).toBe((await stocksPartner()).id);
    });

    it("keeps the caller's own credential partner as the owner", async () => {
      const partner = await createTestPartner({ name: "credential-partner", rampType: RampDirection.BUY });
      const credential = await createTestApiKey({ partnerName: partner.name });
      const { ticket } = await createQuote(buyBody, { "X-API-Key": credential.plaintextKey });

      expect(ticket.partnerId).toBe(partner.id);
      expect(ticket.pricingPartnerId).toBe((await stocksPartner()).id);
    });

    it.each([
      ["BUY", buyBody],
      ["SELL", sellBody]
    ] as const)("fails a %s closed when the partner is gone", async (_label, body) => {
      await Partner.destroy({ where: { name: "vortex-stocks" } });

      const response = await postQuote(body);

      expect(response.status).toBe(500);
      expect(((await response.json()) as { message: string }).message).toBe(QuoteError.FailedToCalculateQuote);
    });

    it("fails closed when only the other direction's row is active", async () => {
      await PartnerPricingConfig.update(
        { isActive: false },
        { where: { partnerId: (await stocksPartner()).id, rampType: RampDirection.BUY } }
      );

      expect((await postQuote(buyBody)).status).toBe(500);
      expect((await postQuote(sellBody)).status).toBe(201);
    });

    it("a request outside BRL via Pix still gets the catalog's 400 without the row", async () => {
      await Partner.destroy({ where: { name: "vortex-stocks" } });

      const mxnBuy = await postQuote({ ...buyBody, from: "spei", inputCurrency: FiatToken.MXN });
      const mxnSell = await postQuote({ ...sellBody, outputCurrency: FiatToken.MXN, to: "spei" });

      for (const response of [mxnBuy, mxnSell]) {
        expect(response.status).toBe(400);
        expect(((await response.json()) as { message: string }).message).toMatch(/No block flow mapped/);
      }
    });
  });

  describe("gas reserve", () => {
    const { gasReserveTargetWei: target, gasReserveThresholdWei: threshold } = config.stocks;
    const usdOf = (wei: bigint) => Number(formatEther(wei)) * ETH_USD;

    it("quotes the full target without a destination address", async () => {
      const { ticket } = await createQuote(buyBody);
      const { blocks, globals } = metadataOf(ticket);

      expect(globals.gasReserve?.amountRaw).toBe(target.toString());
      expect(globals.gasReserve?.quotedFor).toBeUndefined();
      expect(blocks.gasReserveTopUp.amountRaw).toBe(target.toString());
    });

    it("tops up to the target from the destination's balance, and binds the quote to it", async () => {
      const destination = wallet();
      world.evm.setNativeBalance(Networks.Robinhood, destination, threshold - 1n);

      const { ticket } = await createQuote({ ...buyBody, destinationAddress: destination });
      const { blocks, globals } = metadataOf(ticket);

      expect(globals.request.destinationAddress).toBe(destination);
      expect(globals.gasReserve?.amountRaw).toBe((target - threshold + 1n).toString());
      expect(globals.gasReserve?.quotedFor).toBe(destination);
      expect(blocks.gasReserveTopUp).toMatchObject({ amountRaw: (target - threshold + 1n).toString(), quotedFor: destination });
    });

    it("charges nothing for a destination at the threshold, and that shows in the network fee", async () => {
      const funded = wallet();
      world.evm.setNativeBalance(Networks.Robinhood, funded, threshold);
      const empty = wallet();

      const fundedQuote = await createQuote({ ...buyBody, destinationAddress: funded });
      const emptyQuote = await createQuote({ ...buyBody, destinationAddress: empty });

      expect(metadataOf(fundedQuote.ticket).globals.gasReserve?.amountRaw).toBe("0");
      expect(metadataOf(emptyQuote.ticket).globals.gasReserve?.amountRaw).toBe(target.toString());
      expect(Number(emptyQuote.quote.networkFeeUsd) - Number(fundedQuote.quote.networkFeeUsd)).toBeCloseTo(usdOf(target), 5);
    });

    it("never reads a destination address on a SELL", async () => {
      const { ticket } = await createQuote({ ...sellBody, destinationAddress: wallet() });

      expect(metadataOf(ticket).globals.request.destinationAddress).toBeUndefined();
      expect(metadataOf(ticket).globals.gasReserve).toBeUndefined();
    });
  });

  describe("response fields", () => {
    const cost = (quote: QuoteResponse, id: ProviderCost["id"]) => Number(quote.providerCosts?.find(row => row.id === id)?.amountFiat);
    const feeRowsTotal = (quote: QuoteResponse) =>
      (quote.providerCosts ?? []).filter(row => row.includedIn === "fees").reduce((sum, row) => sum + Number(row.amountFiat), 0);
    const reserveFiat = (quote: QuoteResponse) => Number(quote.gasReserveFiat ?? 0);

    /** Sets the Chainlink answer and round time, leaving the pool at `NVDA_USD`. */
    function scriptReference(priceUsd: number, updatedAt = new Date()) {
      const scripted = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) =>
        params.functionName === "latestRoundData"
          ? ([1n, BigInt(Math.round(priceUsd * 1e8)), 0n, BigInt(Math.floor(updatedAt.getTime() / 1000)), 1n] as const)
          : scripted?.(network, params);
    }

    it.each([
      ["BUY", buyBody],
      ["SELL", sellBody]
    ] as const)("%s lists the six providers, in the app's order, marked direct", async (_label, body) => {
      const { quote } = await createQuote(body);

      expect(quote.routingStrategy).toBe("direct");
      expect(quote.providerCosts?.map(({ id, includedIn, provider }) => [id, provider, includedIn])).toEqual([
        ["ramp", "avenia", "fees"],
        ["conversion", "nabla", "rate"],
        ["bridge", "relay", "rate"],
        ["swap", "uniswap", "rate"],
        ["vortex", "vortex", "fees"],
        ["network", "network", "fees"]
      ]);
      for (const { amountFiat } of quote.providerCosts ?? []) expect(amountFiat).toMatch(/^-?\d+\.\d{2}$/);
    });

    it.each([
      ["BUY", buyBody],
      ["BUY, 137 BRL", { ...buyBody, inputAmount: "137" }],
      ["SELL", sellBody],
      ["SELL, a dust-precise amount", { ...sellBody, inputAmount: "1.000000000000000003" }]
    ] as const)("%s: the fee rows reconcile with the fee fields within 0.01", async (_label, body) => {
      const { quote } = await createQuote(body);

      expect(Math.abs(feeRowsTotal(quote) - (Number(quote.totalFeeFiat) - reserveFiat(quote)))).toBeLessThanOrEqual(0.01);
      expect(cost(quote, "ramp")).toBeCloseTo(Number(quote.anchorFeeFiat), 2);
      expect(cost(quote, "vortex")).toBeCloseTo(Number(quote.vortexFeeFiat), 2);
      expect(Math.abs(cost(quote, "network") - (Number(quote.networkFeeFiat) - reserveFiat(quote)))).toBeLessThanOrEqual(0.005);
    });

    it("values the Nabla leg against the oracle, a poor rate as a cost in both directions", async () => {
      const scripted = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) => {
        if (params.functionName !== "quoteSwapExactTokensForTokens") return scripted?.(network, params);
        const amountIn = params.args?.[0] as bigint;
        const fromUsdc = (params.args?.[1] as string[])[0].toLowerCase() === USDC_ON_BASE;
        return fromUsdc ? (amountIn * 49n * 10n ** 12n) / 10n : (amountIn * 18n) / 100n / 10n ** 12n;
      };

      // 500 BRLA less the 0.10 anchor at 0.18 instead of the oracle's 0.20 USDC per BRLA.
      expect(cost((await createQuote(buyBody)).quote, "conversion")).toBe(49.99);
      // 2% below the oracle's 5 BRLA per USDC: 0.5 NVDA at 181, less Relay's 6 bps and the fees in USD.
      const sell = (await createQuote(sellBody)).quote;
      const usdc = 90.5 * (1 - 0.0006) - Number(sell.networkFeeUsd) - Number(sell.vortexFeeUsd);
      expect(cost(sell, "conversion")).toBeCloseTo(usdc * 0.1, 1);
    });

    it("signs the swap row: a fill better than the reference is negative, a worse one positive", async () => {
      scriptReference(182);
      const better = (await createQuote(buyBody)).quote;
      expect(cost(better, "swap")).toBeLessThan(0);
      expect(cost(better, "swap")).toBeCloseTo(-Number(better.outputAmount) * 5, 1);

      scriptReference(180);
      const worse = (await createQuote(buyBody)).quote;
      expect(cost(worse, "swap")).toBeCloseTo(Number(worse.outputAmount) * 5, 1);
    });

    it("never prints a negative zero", async () => {
      // About 0.0025 BRL in the buyer's favour: rounds to a signed zero.
      scriptReference(Number(NVDA_USD) + 0.001);

      const { quote } = await createQuote(buyBody);

      expect(quote.providerCosts?.find(row => row.id === "swap")?.amountFiat).toBe("0.00");
    });

    describe("gasless", () => {
      it("is true on a SELL when the token has a permit", async () => {
        expect((await createQuote(sellBody)).quote.gasless).toBe(true);
      });

      it("is false on a SELL when it has none", async () => {
        const scripted = world.evm.onReadContract;
        world.evm.onReadContract = (network, params) => {
          if (params.functionName !== "nonces") return scripted?.(network, params);
          throw new ContractFunctionExecutionError(new ContractFunctionZeroDataError({ functionName: "nonces" }), {
            abi: params.abi as Abi,
            args: params.args as unknown[],
            functionName: "nonces"
          });
        };

        expect((await createQuote(sellBody)).quote.gasless).toBe(false);
      });

      it("fails the SELL quote when the read itself failed, rather than saying the token has no permit", async () => {
        const scripted = world.evm.onReadContract;
        world.evm.onReadContract = (network, params) => {
          if (params.functionName !== "nonces") return scripted?.(network, params);
          throw new ContractFunctionExecutionError(new HttpRequestError({ status: 503, url: "https://rpc.invalid" }), {
            abi: params.abi as Abi,
            args: params.args as unknown[],
            functionName: "nonces"
          });
        };

        const response = await postQuote(sellBody);

        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain("gasless");
      });

      it("is absent on a BUY", async () => {
        expect((await createQuote(buyBody)).quote).not.toContainKey("gasless");
      });
    });

    describe("SELL amount", () => {
      it.each([
        ["0.123456789012345678", "123456789012345678"],
        ["1.000000000000000001", "1000000000000000001"],
        ["12.5", "12500000000000000000"]
      ])("echoes %s to the wei, on POST, on GET and in what the flow will move", async (amount, wei) => {
        const { quote, ticket } = await createQuote({ ...sellBody, inputAmount: amount });
        const fetched = (await (await app.request(`/v1/quotes/${quote.id}`)).json()) as QuoteResponse;

        for (const { inputAmount } of [quote, fetched]) expect(parseUnits(inputAmount, 18).toString()).toBe(wei);
        expect(metadataOf(ticket).blocks.stockPermitSource.amountRaw).toBe(wei);
      });

      it.each(["0.1234567890123456789", "1.5e-18"])("refuses %s, which no wei amount can echo", async amount => {
        const response = await postQuote({ ...sellBody, inputAmount: amount });

        expect(response.status).toBe(400);
        expect(((await response.json()) as { message: string }).message).toBe("The amount has more than 18 decimal places.");
      });
    });

    describe("gas reserve", () => {
      const { gasReserveTargetWei: target, gasReserveThresholdWei: threshold } = config.stocks;

      function fundedWallet() {
        const funded = wallet();
        world.evm.setNativeBalance(Networks.Robinhood, funded, threshold);
        return funded;
      }

      it("reports the target in ETH when no wallet is named", async () => {
        const { quote } = await createQuote(buyBody);

        expect(quote).toMatchObject({
          gasReserveAmount: formatEther(target),
          gasReserveCurrency: "ETH",
          gasReserveFiat: String(Number(formatEther(target)) * ETH_USD * 5),
          gasReserveUsd: String(Number(formatEther(target)) * ETH_USD)
        });
      });

      it("reports the top-up that reaches the target from the wallet's balance", async () => {
        const destination = wallet();
        world.evm.setNativeBalance(Networks.Robinhood, destination, threshold - 1n);

        const { quote } = await createQuote({ ...buyBody, destinationAddress: destination });

        expect(quote.gasReserveAmount).toBe(formatEther(target - threshold + 1n));
      });

      it("sits inside the network and total fees, and leaves the network row", async () => {
        const empty = (await createQuote({ ...buyBody, destinationAddress: wallet() })).quote;
        const paid = (await createQuote({ ...buyBody, destinationAddress: fundedWallet() })).quote;

        const reserve = Number(empty.gasReserveFiat);
        expect(reserve).toBeGreaterThan(0);
        expect(Number(empty.networkFeeFiat) - Number(paid.networkFeeFiat)).toBeCloseTo(reserve, 5);
        // Each total is rounded to the cent on its own, so their difference can be off by one.
        expect(Math.abs(Number(empty.totalFeeFiat) - Number(paid.totalFeeFiat) - reserve)).toBeLessThanOrEqual(0.01);
        expect(Number(empty.networkFeeUsd) - Number(paid.networkFeeUsd)).toBeCloseTo(Number(empty.gasReserveUsd), 5);
        expect(cost(empty, "network")).toBeCloseTo(cost(paid, "network"), 2);
      });

      it.each([
        ["a funded wallet", () => ({ ...buyBody, destinationAddress: fundedWallet() })],
        ["a SELL", () => sellBody]
      ])("is not in the response for %s", async (_label, body) => {
        const { quote } = await createQuote(body());

        for (const field of GAS_RESERVE_FIELDS) expect(quote).not.toContainKey(field);
      });

      it("is not in the response when the reserve is switched off", async () => {
        config.stocks.gasReserveTargetWei = 0n;
        try {
          const { quote } = await createQuote(buyBody);

          for (const field of GAS_RESERVE_FIELDS) expect(quote).not.toContainKey(field);
        } finally {
          config.stocks.gasReserveTargetWei = target;
        }
      });
    });

    describe("every response builder", () => {
      it.each([
        ["BUY", buyBody],
        ["SELL", sellBody]
      ] as const)("GET /quotes/:id of a %s matches POST /quotes", async (_label, body) => {
        const { quote } = await createQuote(body);

        const response = await app.request(`/v1/quotes/${quote.id}`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(quote);
      });

      it.each([
        ["BUY", buyBody],
        ["SELL", sellBody]
      ] as const)("the unpersisted response of a %s matches the persisted one", async (_label, body) => {
        const { quote } = await createQuote(body);
        const ctx = createQuoteContext({
          partner: { id: (await stocksPartner()).id },
          request: body as CreateQuoteRequest,
          targetFeeFiatCurrency: FiatToken.BRL
        });
        ctx.skipPersistence = true;

        await runBlockQuoteFlow(ctx);

        const { id: _temporaryId, createdAt: _temporaryAt, expiresAt: _temporaryExpiry, ...temporary } = ctx.builtResponse as QuoteResponse;
        const { id: _id, createdAt: _at, expiresAt: _expiry, ...persisted } = quote;
        expect(temporary).toEqual(persisted);
      });

      async function registeredBuy(destination: string) {
        const { quote } = await createQuote({ ...buyBody, destinationAddress: destination });
        const response = await register(quote.id, { destinationAddress: destination });
        expect(response.status, await response.clone().text()).toBe(201);
        return { id: ((await response.json()) as { id: string }).id, quote };
      }

      async function rampStatus(id: string) {
        const { userId } = (await RampState.findByPk(id)) as RampState;
        const response = await app.request(`/v1/ramp/${id}`, { headers: { Authorization: `Bearer ${testUserToken(userId as string)}` } });
        expect(response.status).toBe(200);
        return (await response.json()) as Record<string, unknown>;
      }

      it("the ramp status of a BUY repeats the quote's reserve", async () => {
        const { id, quote } = await registeredBuy(wallet());

        expect(await rampStatus(id)).toMatchObject({
          gasReserveAmount: quote.gasReserveAmount,
          gasReserveCurrency: "ETH",
          gasReserveFiat: quote.gasReserveFiat,
          gasReserveUsd: quote.gasReserveUsd
        });
      });

      it("the ramp status has no reserve when the wallet needed none", async () => {
        const funded = wallet();
        world.evm.setNativeBalance(Networks.Robinhood, funded, config.stocks.gasReserveThresholdWei);
        const { id } = await registeredBuy(funded);

        const status = await rampStatus(id);

        expect(status.id).toBe(id);
        for (const field of GAS_RESERVE_FIELDS) expect(status).not.toContainKey(field);
      });

      it("the ramp status of a SELL has no reserve", async () => {
        const { quote } = await createQuote(sellBody);
        const response = await register(quote.id, { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID, walletAddress: wallet() });
        expect(response.status).toBe(201);

        const status = await rampStatus(((await response.json()) as { id: string }).id);

        expect(status.currentPhase).toBeTruthy();
        for (const field of GAS_RESERVE_FIELDS) expect(status).not.toContainKey(field);
      });
    });

    describe("other corridors", () => {
      it.each([
        [
          "BUY to Base",
          { from: "pix", inputAmount: "100", inputCurrency: FiatToken.BRL, network: Networks.Base, outputCurrency: EvmToken.BRLA, rampType: RampDirection.BUY, to: Networks.Base }
        ],
        [
          "SELL from Base",
          { from: Networks.Base, inputAmount: "100", inputCurrency: EvmToken.USDC, network: Networks.Base, outputCurrency: FiatToken.BRL, rampType: RampDirection.SELL, to: "pix" }
        ]
      ])("%s keeps its exact keys and order, on POST and GET", async (_label, body) => {
        const { quote, ticket } = await createQuote(body);
        const fetched = (await (await app.request(`/v1/quotes/${quote.id}`)).json()) as QuoteResponse;

        for (const response of [quote, fetched]) expect(Object.keys(response)).toEqual(EXISTING_CORRIDOR_RESPONSE_KEYS);
        const { globals } = metadataOf(ticket);
        for (const field of ["routingStrategy", "providerCosts", "gasless", "gasReserve"]) expect(globals).not.toContainKey(field);
      });
    });

    describe("price guard", () => {
      const priceUnavailable = { message: QuoteError.StockPriceUnavailable, status: 503 };

      async function expectRejected(body: Record<string, unknown>, { message, status }: { message: string; status: number }) {
        const response = await postQuote(body);
        expect(response.status).toBe(status);
        expect(((await response.json()) as { message: string }).message).toBe(message);
      }

      it.each([
        ["BUY, reference 3% under the pool", buyBody, 181 * 0.97],
        ["SELL, reference 3% over the pool", sellBody, 181 * 1.03]
      ])("rejects a %s with the public 503", async (_label, body, reference) => {
        scriptReference(reference);

        await expectRejected(body, priceUnavailable);
      });

      it.each([
        ["BUY, reference 3% over the pool, in the buyer's favour", buyBody, 181 * 1.03],
        ["SELL, reference 3% under the pool, in the seller's favour", sellBody, 181 * 0.97],
        ["BUY, reference 1% under the pool", buyBody, 181 * 0.99],
        ["SELL, reference 1% over the pool", sellBody, 181 * 1.01],
        ["BUY, reference on the pool", buyBody, 181],
        ["SELL, reference on the pool", sellBody, 181]
      ])("passes a %s", async (_label, body, reference) => {
        scriptReference(reference);

        expect((await postQuote(body)).status).toBe(201);
      });

      const maxAgeMs = config.stocks.priceReferenceMaxAgeHours * 60 * 60 * 1000;

      it.each([
        ["BUY", buyBody],
        ["SELL", sellBody]
      ] as const)("fails a %s closed on a stale reference, and passes a fresh one", async (_label, body) => {
        scriptReference(181, new Date(Date.now() - maxAgeMs - 60_000));
        await expectRejected(body, priceUnavailable);

        scriptReference(181, new Date(Date.now() - maxAgeMs + 60_000));
        expect((await postQuote(body)).status).toBe(201);
      });

      it.each([
        ["BUY", buyBody],
        ["SELL", sellBody]
      ] as const)("fails a %s closed when the reference cannot be read", async (_label, body) => {
        const scripted = world.evm.onReadContract;
        world.evm.onReadContract = (network, params) => {
          if (params.functionName === "latestRoundData") throw new Error("RPC down");
          return scripted?.(network, params);
        };

        await expectRejected(body, priceUnavailable);
      });

      it("keeps nothing of a rejected quote", async () => {
        scriptReference(181 * 0.97);

        await postQuote(buyBody);

        expect(await QuoteTicket.count()).toBe(0);
      });
    });

    describe("pause", () => {
      it.each([
        ["BUY", buyBody, "paused"],
        ["BUY", buyBody, "oraclePaused"],
        ["SELL", sellBody, "paused"],
        ["SELL", sellBody, "oraclePaused"]
      ] as const)("answers a %s with the public 503 when %s is set", async (_label, body, flag) => {
        const scripted = world.evm.onReadContract;
        world.evm.onReadContract = (network, params) =>
          params.functionName === flag ? true : scripted?.(network, params);

        const response = await postQuote(body);

        expect(response.status).toBe(503);
        expect(((await response.json()) as { message: string }).message).toBe(QuoteError.StockTradingPaused);
      });
    });

    describe("kill switch", () => {
      it.each([
        ["BUY", buyBody],
        ["SELL", sellBody]
      ] as const)("answers a %s as an unknown network when no direction is enabled", async (_label, body) => {
        config.stocks.enabledDirections = [];

        const response = await postQuote(body);

        expect(response.status).toBe(400);
        expect(((await response.json()) as { message: string }).message).toBe("Invalid network: robinhood");
      });

      it("switches one direction off without the other", async () => {
        config.stocks.enabledDirections = [RampDirection.SELL];

        expect((await postQuote(buyBody)).status).toBe(400);
        expect((await postQuote(sellBody)).status).toBe(201);
      });

      it("stops new quotes only: a quote made before it still reads and registers", async () => {
        const { quote } = await createQuote(buyBody);

        config.stocks.enabledDirections = [];

        expect((await app.request(`/v1/quotes/${quote.id}`)).status).toBe(200);
        expect((await register(quote.id, { destinationAddress: wallet() })).status).toBe(201);
      });
    });
  });

  describe("best quote", () => {
    it("never reads Robinhood Chain or asks Relay, in either direction", async () => {
      const reads: string[] = [];
      const scripted = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) => {
        if (network === Networks.Robinhood) reads.push(params.functionName);
        return scripted?.(network, params);
      };
      const relayRequests = world.relay.quoteRequests.length;
      const { network: _buyNetwork, to: _buyTo, ...bestBuy } = buyBody;
      const { from: _sellFrom, network: _sellNetwork, ...bestSell } = sellBody;

      const responses = await Promise.all(
        [bestBuy, bestSell].map(body =>
          app.request("/v1/quotes/best", {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
            method: "POST"
          })
        )
      );

      for (const response of responses) {
        expect(((await response.json()) as { network?: string }).network).not.toBe(Networks.Robinhood);
      }
      expect(reads).toEqual([]);
      expect(world.relay.quoteRequests).toHaveLength(relayRequests);
    }, 20_000);

    it("has nothing to offer a client that whitelists only Robinhood Chain", async () => {
      const { network: _network, to: _to, ...best } = buyBody;

      const response = await app.request("/v1/quotes/best", {
        body: JSON.stringify({ ...best, networks: [Networks.Robinhood] }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(400);
    });
  });

  describe("registration through the real hooks", () => {
    async function pauseAtRegistration(symbol: StockSymbol) {
      const scripted = world.evm.onReadContract;
      world.evm.onReadContract = (network, params) =>
        params.functionName === "paused" && params.address === ROBINHOOD_STOCKS[symbol].address
          ? true
          : scripted?.(network, params);
    }

    it("registers a BUY for a Bearer user and persists the block facts", async () => {
      const destination = wallet();
      const { quote } = await createQuote({ ...buyBody, destinationAddress: destination });

      const response = await register(quote.id, { destinationAddress: destination });

      expect(response.status, await response.clone().text()).toBe(201);
      const { id, depositQrCode } = (await response.json()) as { depositQrCode?: string; id: string };
      // Released by the update step, once the presigned transactions validate.
      expect(depositQrCode).toBeUndefined();
      const ramp = (await RampState.findByPk(id)) as RampState;
      expect((ramp.state as { depositQrCode?: string }).depositQrCode).toBeTruthy();
      expect((ramp.unsignedTxs as UnsignedTx[]).map(tx => tx.phase)).toEqual(
        expect.arrayContaining(["relayApprove", "relayBridge", "uniswapApprove", "uniswapSwap", "destinationTransfer"])
      );
      expect((ramp.state as { relayRequestId?: string }).relayRequestId).toBeTruthy();
    });

    it("registers a SELL for a Bearer user and persists the deposit address", async () => {
      const { quote } = await createQuote(sellBody);

      const response = await register(quote.id, { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID, walletAddress: wallet() });

      expect(response.status, await response.clone().text()).toBe(201);
      const { id } = (await response.json()) as { id: string };
      const ramp = (await RampState.findByPk(id)) as RampState;
      expect((ramp.unsignedTxs as UnsignedTx[]).map(tx => tx.phase)).toEqual(
        expect.arrayContaining(["stockPermitTransfer", "uniswapApprove", "uniswapSwap", "nablaSwap"])
      );
      expect((ramp.state as { relayDepositAddress?: string }).relayDepositAddress).toMatch(/^0x/);
    });

    it("rejects a BUY registered for another wallet than the reserve was sized for", async () => {
      const { quote } = await createQuote({ ...buyBody, destinationAddress: wallet() });

      const response = await register(quote.id, { destinationAddress: wallet() });

      expect(response.status).toBe(400);
    });

    it("rejects a SELL without the seller's wallet", async () => {
      const { quote } = await createQuote(sellBody);

      const response = await register(quote.id, { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID });

      expect(response.status).toBe(400);
    });

    it.each([
      ["BUY", { ...buyBody, outputCurrency: EvmToken.TSLA }, { destinationAddress: wallet() }],
      ["SELL", { ...sellBody, inputCurrency: EvmToken.TSLA }, { pixDestination: PIX_KEY, receiverTaxId: RECEIVER_TAX_ID, walletAddress: wallet() }]
    ] as const)("the register hook of a %s reads the flags of the quoted token, not the executor instance's", async (_label, body, data) => {
      world.prices.perUsd.tsla = 1 / Number(NVDA_USD);
      const { quote, ticket } = await createQuote(body);
      expect(metadataOf(ticket).blocks.stockRoute.token).toBe(EvmToken.TSLA);
      await pauseAtRegistration(EvmToken.TSLA as StockSymbol);

      const response = await register(quote.id, data);

      expect(response.status).toBe(503);
      expect(((await response.json()) as { message: string }).message).toBe(QuoteError.StockTradingPaused);
    });
  });
});
