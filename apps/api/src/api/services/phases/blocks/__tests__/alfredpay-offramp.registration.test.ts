import { describe, expect, it, mock } from "bun:test";
import { type EvmNetworks, EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { registerAlfredpayOfframp } from "../phases/alfredpay-offramp/registration";
import type { AlfredpayOfframpMetadata } from "../phases/alfredpay-offramp/simulation";

const metadata: AlfredpayOfframpMetadata = {
  adjustedDifference: "0",
  adjustedTargetDiscount: "0",
  bridgeInputAmountRaw: "100000000",
  bridgeOutputAmountDecimal: "99",
  bridgeOutputAmountRaw: "99000000",
  currency: FiatToken.MXN,
  expirationDate: new Date("2026-01-01T00:00:00Z"),
  fee: "1",
  fromNetwork: Networks.Base as EvmNetworks,
  fromToken: "0x1111111111111111111111111111111111111111" as const,
  inputAmountDecimal: "99",
  inputAmountRaw: "99000000",
  network: Networks.Polygon,
  outputAmountDecimal: "1980",
  outputAmountRaw: "198000",
  quoteId: "quote-old",
  subsidyAmountDecimal: "0",
  subsidyAmountRaw: "0",
  token: EvmToken.USDT,
  toToken: "0x2222222222222222222222222222222222222222" as const
};

function context() {
  return {
    authenticatedUser: { id: "user-1" },
    input: { fiatAccountId: "fiat-1", walletAddress: "0x3333333333333333333333333333333333333333" },
    metadata,
    quote: { inputAmount: "100" } as never,
    signingAccounts: [{ address: "0x4444444444444444444444444444444444444444", type: "EVM" }] as never
  };
}

describe("Alfredpay offramp registration", () => {
  it("refreshes exact quotes, creates the order, and updates only provider identity metadata", async () => {
    const service = {
      createOfframp: mock(async () => ({
        depositAddress: "0x5555555555555555555555555555555555555555",
        transactionId: "transaction-1"
      })),
      createOfframpQuote: mock(async () => ({
        expiration: "2026-01-01T00:01:00Z",
        fees: [{ amount: "1", currency: "MXN" }],
        quoteId: "quote-new",
        toAmount: "1980"
      }))
    } as never;
    const result = await registerAlfredpayOfframp(context(), {
      resolveCustomerId: async () => "customer-1",
      service
    });
    expect(result.metadata).toEqual({
      ...metadata,
      expirationDate: new Date("2026-01-01T00:01:00Z"),
      quoteId: "quote-new"
    });
    expect(result.facts).toEqual({
      alfredpayTransactionId: "transaction-1",
      alfredpayUserId: "customer-1",
      depositAddress: "0x5555555555555555555555555555555555555555",
      fiatAccountId: "fiat-1",
      walletAddress: "0x3333333333333333333333333333333333333333"
    });
  });

  it("hard-fails on refreshed amount drift before creating an order", async () => {
    const createOrder = mock(async () => ({}));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        expiration: "2026-01-01T00:01:00Z",
        fees: [{ amount: "1", currency: "MXN" }],
        quoteId: "quote-new",
        toAmount: "1979"
      }))
    } as never;
    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("drifted");
    expect(createOrder).not.toHaveBeenCalled();
  });
});
