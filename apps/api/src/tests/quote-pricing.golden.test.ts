import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocksPartner } from "../database/migrations/089-add-stocks-partner";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * Golden tests for the quote pricing math. Every external input is pinned:
 * FakePrices rates (BRL 5/USD, ETH 2,500/USD, USDC 1/USD), FakeEvm fees
 * (1 gwei), FakeBrla pay-in/pay-out rate 1, a scripted Nabla quoter at
 * 0.18 USDC per BRLA, and for Robinhood Chain a Uniswap pool and Chainlink feed
 * at 181 USD per NVDA with FakeRelay keeping 6 bps. Under those inputs the
 * fee/output values below are pure functions of the pricing engines.
 *
 * A diff here means the pricing math changed. If that is intentional, update
 * the goldens consciously and call out the fee impact in the PR description —
 * never "fix" a golden to make CI pass.
 */
describe("quote pricing goldens (fixed input matrix)", () => {
  let world: FakeWorld;
  let app: TestApp;
  const enabledDirections = config.stocks.enabledDirections;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    await resetTestDatabase();
    await seedStocksPartner(sequelize.getQueryInterface());
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    app = await startTestApp();

    // Deterministic Nabla quotes: 0.18 USDC per BRLA on BUY and the pinned
    // oracle rate of 5 BRLA per USDC on SELL.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return amountIn >= 10n ** 18n ? (amountIn * 18n) / 100n / 10n ** 12n : amountIn * 5n * 10n ** 12n;
      }
      return undefined;
    };
    scriptRobinhoodChain(world.evm, 181n);
  });

  afterAll(async () => {
    config.stocks.enabledDirections = enabledDirections;
    await app?.close();
    world?.restore();
  });

  const VOLATILE_FIELDS = ["id", "createdAt", "expiresAt"];

  async function quoteViaApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    const quote = (await response.json()) as Record<string, unknown>;
    for (const field of VOLATILE_FIELDS) {
      expect(quote[field]).toBeTruthy();
      delete quote[field];
    }
    return quote;
  }

  const GOLDENS: Array<{ name: string; request: Record<string, unknown>; expected: Record<string, unknown> }> = [
    {
      expected: {
        anchorFeeFiat: "0.1",
        anchorFeeUsd: "0.02",
        feeCurrency: "BRL",
        from: "pix",
        inputAmount: "100.00",
        inputCurrency: "BRL",
        network: "base",
        networkFeeFiat: "0",
        networkFeeUsd: "0",
        outputAmount: "99.90",
        outputCurrency: "BRLA",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0.1",
        processingFeeUsd: "0.02",
        rampType: "BUY",
        to: "base",
        totalFeeFiat: "0.10",
        totalFeeUsd: "0.020000",
        vortexFeeFiat: "0",
        vortexFeeUsd: "0"
      },
      name: "BUY 100 BRL → BRLA on Base (direct Avenia corridor)",
      request: {
        from: "pix",
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.BRLA,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }
    },
    {
      expected: {
        anchorFeeFiat: "0.1",
        anchorFeeUsd: "0.02",
        feeCurrency: "BRL",
        from: "pix",
        inputAmount: "250.50",
        inputCurrency: "BRL",
        network: "base",
        networkFeeFiat: "0",
        networkFeeUsd: "0",
        outputAmount: "250.40",
        outputCurrency: "BRLA",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0.1",
        processingFeeUsd: "0.02",
        rampType: "BUY",
        to: "base",
        totalFeeFiat: "0.10",
        totalFeeUsd: "0.020000",
        vortexFeeFiat: "0",
        vortexFeeUsd: "0"
      },
      name: "BUY 250.50 BRL → BRLA on Base (flat anchor fee, not proportional)",
      request: {
        from: "pix",
        inputAmount: "250.50",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.BRLA,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }
    },
    {
      expected: {
        anchorFeeFiat: "0.1",
        anchorFeeUsd: "0.02",
        feeCurrency: "BRL",
        from: "pix",
        inputAmount: "100.00",
        inputCurrency: "BRL",
        network: "base",
        networkFeeFiat: "2.115",
        networkFeeUsd: "0.423",
        outputAmount: "17.559",
        outputCurrency: "USDC",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0.1",
        processingFeeUsd: "0.02",
        rampType: "BUY",
        to: "base",
        totalFeeFiat: "2.22",
        totalFeeUsd: "0.443000",
        vortexFeeFiat: "0",
        vortexFeeUsd: "0"
      },
      name: "BUY 100 BRL → USDC on Base (Nabla swap at 0.18, zero-discount partner)",
      request: {
        from: "pix",
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }
    },
    {
      expected: {
        anchorFeeFiat: "0",
        anchorFeeUsd: "0",
        feeCurrency: "BRL",
        from: "base",
        inputAmount: "100.00",
        inputCurrency: "BRLA",
        network: "base",
        networkFeeFiat: "0",
        networkFeeUsd: "0",
        // 100 BRLA is worth ~100 BRL (1:1 peg), not 500: the discount engine now values the
        // BRLA input in USD (~20 USD at 5 BRL/USD) before applying the inverted oracle rate,
        // instead of treating 100 BRLA as 100 USD → 500 BRL.
        outputAmount: "100.00",
        outputCurrency: "BRL",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0",
        processingFeeUsd: "0",
        rampType: "SELL",
        to: "pix",
        totalFeeFiat: "0.00",
        totalFeeUsd: "0.000000",
        vortexFeeFiat: "0",
        vortexFeeUsd: "0"
      },
      name: "SELL 100 BRLA on Base → BRL (direct Avenia payout, 5 BRL/USD feed)",
      request: {
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.BRLA,
        network: Networks.Base,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      }
    },
    {
      expected: {
        anchorFeeFiat: "0",
        anchorFeeUsd: "0",
        feeCurrency: "BRL",
        from: "base",
        inputAmount: "100.00",
        inputCurrency: "USDC",
        network: "base",
        networkFeeFiat: "0",
        networkFeeUsd: "0",
        outputAmount: "500.00",
        outputCurrency: "BRL",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0",
        processingFeeUsd: "0",
        rampType: "SELL",
        to: "pix",
        totalFeeFiat: "0.00",
        totalFeeUsd: "0.000000",
        vortexFeeFiat: "0",
        vortexFeeUsd: "0"
      },
      name: "SELL 100 USDC on Base → BRL (direct payout, 5 BRL/USD feed)",
      request: {
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Base,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      }
    },
    {
      expected: {
        anchorFeeFiat: "0.1",
        anchorFeeUsd: "0.02",
        feeCurrency: "BRL",
        from: "pix",
        gasReserveAmount: "0.00005",
        gasReserveCurrency: "ETH",
        gasReserveFiat: "0.625",
        gasReserveUsd: "0.125",
        inputAmount: "500.00",
        inputCurrency: "BRL",
        network: "robinhood",
        networkFeeFiat: "51.20872",
        networkFeeUsd: "10.241744",
        outputAmount: "0.439925480662983425",
        outputCurrency: "NVDA",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0.35",
        processingFeeUsd: "0.07",
        providerCosts: [
          { amountFiat: "0.10", id: "ramp", includedIn: "fees", provider: "avenia" },
          { amountFiat: "49.99", id: "conversion", includedIn: "rate", provider: "nabla" },
          { amountFiat: "0.32", id: "bridge", includedIn: "rate", provider: "relay" },
          { amountFiat: "0.00", id: "swap", includedIn: "rate", provider: "uniswap" },
          { amountFiat: "0.25", id: "vortex", includedIn: "fees", provider: "vortex" },
          { amountFiat: "50.58", id: "network", includedIn: "fees", provider: "network" }
        ],
        rampType: "BUY",
        routingStrategy: "direct",
        to: "robinhood",
        totalFeeFiat: "51.56",
        totalFeeUsd: "10.311744",
        vortexFeeFiat: "0.25",
        vortexFeeUsd: "0.05"
      },
      name: "BUY 500 BRL → NVDA on Robinhood Chain (full gas reserve, no wallet named)",
      request: {
        from: "pix",
        inputAmount: "500",
        inputCurrency: FiatToken.BRL,
        network: Networks.Robinhood,
        outputCurrency: EvmToken.NVDA,
        rampType: RampDirection.BUY,
        to: Networks.Robinhood
      }
    },
    {
      expected: {
        anchorFeeFiat: "0",
        anchorFeeUsd: "0",
        feeCurrency: "BRL",
        from: "robinhood",
        gasless: true,
        inputAmount: "0.50",
        inputCurrency: "NVDA",
        network: "robinhood",
        networkFeeFiat: "63.75",
        networkFeeUsd: "12.75",
        outputAmount: "388.24",
        outputCurrency: "BRL",
        partnerFeeFiat: "0",
        partnerFeeUsd: "0",
        paymentMethod: "pix",
        processingFeeFiat: "0.23",
        processingFeeUsd: "0.046",
        providerCosts: [
          { amountFiat: "0.00", id: "ramp", includedIn: "fees", provider: "avenia" },
          { amountFiat: "0.00", id: "conversion", includedIn: "rate", provider: "nabla" },
          { amountFiat: "0.27", id: "bridge", includedIn: "rate", provider: "relay" },
          { amountFiat: "0.00", id: "swap", includedIn: "rate", provider: "uniswap" },
          { amountFiat: "0.23", id: "vortex", includedIn: "fees", provider: "vortex" },
          { amountFiat: "63.75", id: "network", includedIn: "fees", provider: "network" }
        ],
        rampType: "SELL",
        routingStrategy: "direct",
        to: "pix",
        totalFeeFiat: "63.98",
        totalFeeUsd: "12.796000",
        vortexFeeFiat: "0.23",
        vortexFeeUsd: "0.046"
      },
      name: "SELL 0.5 NVDA on Robinhood Chain → BRL (gasless permit)",
      request: {
        from: Networks.Robinhood,
        inputAmount: "0.5",
        inputCurrency: EvmToken.NVDA,
        network: Networks.Robinhood,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      }
    }
  ];

  for (const golden of GOLDENS) {
    it(golden.name, async () => {
      const quote = await quoteViaApi(golden.request);
      expect(quote).toEqual(golden.expected);
    });
  }
});
