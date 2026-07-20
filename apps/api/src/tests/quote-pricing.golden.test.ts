import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * Golden tests for the quote pricing math. Every external input is pinned:
 * FakePrices rates (BRL 5/USD, USDC 1/USD), FakeBrla pay-in/pay-out rate 1,
 * and a scripted Nabla quoter at 0.18 USDC per BRLA. Under those inputs the
 * fee/output values below are pure functions of the pricing engines.
 *
 * A diff here means the pricing math changed. If that is intentional, update
 * the goldens consciously and call out the fee impact in the PR description —
 * never "fix" a golden to make CI pass.
 */
describe("quote pricing goldens (fixed input matrix)", () => {
  let world: FakeWorld;
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    await resetTestDatabase();
    app = await startTestApp();

    // Deterministic Nabla swap quote: 18-decimal BRLA in → 6-decimal USDC out
    // at a flat 0.18 USDC per BRLA.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return (amountIn * 18n) / 100n / 10n ** 12n;
      }
      return undefined;
    };
  });

  afterAll(async () => {
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
        discountCurrency: "BRL",
        discountFiat: "10.09",
        discountUsd: "2.018000",
        feeCurrency: "BRL",
        from: "pix",
        inputAmount: "100.00",
        inputCurrency: "BRL",
        network: "base",
        networkFeeFiat: "0",
        networkFeeUsd: "0",
        outputAmount: "20.00",
        outputCurrency: "USDC",
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
      name: "BUY 100 BRL → USDC on Base (Nabla swap at 0.18, subsidy applied)",
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
    }
  ];

  for (const golden of GOLDENS) {
    it(golden.name, async () => {
      const quote = await quoteViaApi(golden.request);
      expect(quote).toEqual(golden.expected);
    });
  }
});
