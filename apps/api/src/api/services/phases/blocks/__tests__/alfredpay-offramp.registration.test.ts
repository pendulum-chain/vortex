import { describe, expect, it, mock } from "bun:test";
import {
  AlfredpayFeeType,
  AlfredpayChain,
  AlfredpayOfframpStatus,
  AlfredpayOnChainCurrency,
  type EvmNetworks,
  EvmToken,
  FiatToken,
  Networks
} from "@vortexfi/shared";
import { registerAlfredpayOfframp } from "../phases/alfredpay-offramp/registration";
import type { AlfredpayOfframpMetadata } from "../phases/alfredpay-offramp/simulation";

const safeExpiration = new Date(Date.now() + 10 * 60_000).toISOString();

const metadata: AlfredpayOfframpMetadata = {
  adjustedDifference: "0",
  adjustedTargetDiscount: "0",
  bridgeInputAmountRaw: "100000000",
  bridgeOutputAmountDecimal: "99",
  bridgeOutputAmountRaw: "99000000",
  currency: FiatToken.MXN,
  executableBridgeOutputRaw: "99000000",
  expirationDate: new Date("2026-01-01T00:00:00Z"),
  fee: "1",
  fromNetwork: Networks.Base as EvmNetworks,
  fromToken: "0x1111111111111111111111111111111111111111" as const,
  inputAmountDecimal: "99",
  inputAmountRaw: "99000000",
  network: Networks.Polygon,
  outputAmountDecimal: "1980",
  outputAmountRaw: "198000",
  pricing: {
    customer: { allInRate: "19.8", inputAmountUsd: "100", referenceDifferenceBps: "-100" },
    provider: {
      baseCurrency: AlfredpayOnChainCurrency.USDT,
      feeAmount: "1",
      fees: [{ amount: "1", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }],
      grossRate: "20",
      grossReferenceDifferenceBps: "0",
      netRate: "20",
      netReferenceDifferenceBps: "0",
      quoteCurrency: FiatToken.MXN,
      quotedAt: new Date("2026-01-01T00:00:00Z"),
      source: "alfredpay"
    },
    reference: {
      baseCurrency: "USD",
      observedAt: new Date("2026-01-01T00:00:00Z"),
      quoteCurrency: FiatToken.MXN,
      rate: "20",
      source: "fastforex"
    }
  },
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
        chain: AlfredpayChain.MATIC,
        customerId: "customer-1",
        depositAddress: "0x5555555555555555555555555555555555555555",
        expiration: safeExpiration,
        fiatAccountId: "fiat-1",
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        status: AlfredpayOfframpStatus.CREATED,
        toAmount: "1980",
        toCurrency: FiatToken.MXN,
        transactionId: "transaction-1"
      })),
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;
    const result = await registerAlfredpayOfframp(context(), {
      resolveCustomerId: async () => "customer-1",
      service
    });
    expect(result.metadata).toEqual({
      ...metadata,
      expirationDate: new Date(safeExpiration),
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

  it("hard-fails on refreshed output drift before creating an order", async () => {
    const createOrder = mock(async () => ({}));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1979",
        toCurrency: FiatToken.MXN
      }))
    } as never;
    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("drifted");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("hard-fails on refreshed input drift before creating an order", async () => {
    const createOrder = mock(async () => ({}));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "98.999999",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;
    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("drifted");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("hard-fails on refreshed currency drift before creating an order", async () => {
    const createOrder = mock(async () => ({}));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1980",
        toCurrency: FiatToken.COP
      }))
    } as never;
    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("drifted");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("rejects a refreshed quote that cannot safely survive registration and signing", async () => {
    const createOrder = mock(async () => ({}));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: new Date(Date.now() + 5_000).toISOString(),
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-near-expiry",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;

    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("drifted");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("fails closed when the created order is not bound to the refreshed quote", async () => {
    const createOrder = mock(async () => ({
      chain: AlfredpayChain.MATIC,
      customerId: "customer-1",
      depositAddress: "0x5555555555555555555555555555555555555555",
      expiration: safeExpiration,
      fiatAccountId: "fiat-1",
      fromAmount: "99",
      fromCurrency: AlfredpayOnChainCurrency.USDT,
      status: AlfredpayOfframpStatus.CREATED,
      toAmount: "1979",
      toCurrency: FiatToken.MXN,
      transactionId: "transaction-drifted"
    }));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;

    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("Created Alfredpay offramp order drifted");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the created order cannot safely outlive broadcast and indexing", async () => {
    const createOrder = mock(async () => ({
      chain: AlfredpayChain.MATIC,
      customerId: "customer-1",
      depositAddress: "0x5555555555555555555555555555555555555555",
      expiration: new Date(Date.now() + 30_000).toISOString(),
      fiatAccountId: "fiat-1",
      fromAmount: "99",
      fromCurrency: AlfredpayOnChainCurrency.USDT,
      status: AlfredpayOfframpStatus.CREATED,
      toAmount: "1980",
      toCurrency: FiatToken.MXN,
      transactionId: "transaction-near-expiry"
    }));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: safeExpiration,
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-new",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;

    await expect(
      registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
    ).rejects.toThrow("Created Alfredpay offramp order drifted");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("accepts a usable short-lived provider quote when the created order has safe execution lifetime", async () => {
    const createOrder = mock(async () => ({
      chain: AlfredpayChain.MATIC,
      customerId: "customer-1",
      depositAddress: "0x5555555555555555555555555555555555555555",
      expiration: safeExpiration,
      fiatAccountId: "fiat-1",
      fromAmount: "99",
      fromCurrency: AlfredpayOnChainCurrency.USDT,
      status: AlfredpayOfframpStatus.CREATED,
      toAmount: "1980",
      toCurrency: FiatToken.MXN,
      transactionId: "transaction-short-quote"
    }));
    const service = {
      createOfframp: createOrder,
      createOfframpQuote: mock(async () => ({
        chain: AlfredpayChain.MATIC,
        expiration: new Date(Date.now() + 30_000).toISOString(),
        fees: [{ amount: "1", currency: "MXN" }],
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        quoteId: "quote-short-lived",
        toAmount: "1980",
        toCurrency: FiatToken.MXN
      }))
    } as never;

    const result = await registerAlfredpayOfframp(context(), {
      resolveCustomerId: async () => "customer-1",
      service
    });

    expect(result.facts.alfredpayTransactionId).toBe("transaction-short-quote");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects created-order responses whose lifecycle is not CREATED", async () => {
    for (const status of [AlfredpayOfframpStatus.FAILED, AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED]) {
      const createOrder = mock(async () => ({
        chain: AlfredpayChain.MATIC,
        customerId: "customer-1",
        depositAddress: "0x5555555555555555555555555555555555555555",
        expiration: safeExpiration,
        fiatAccountId: "fiat-1",
        fromAmount: "99",
        fromCurrency: AlfredpayOnChainCurrency.USDT,
        status,
        toAmount: "1980",
        toCurrency: FiatToken.MXN,
        transactionId: `transaction-${status}`
      }));
      const service = {
        createOfframp: createOrder,
        createOfframpQuote: mock(async () => ({
          chain: AlfredpayChain.MATIC,
          expiration: safeExpiration,
          fees: [{ amount: "1", currency: "MXN" }],
          fromAmount: "99",
          fromCurrency: AlfredpayOnChainCurrency.USDT,
          quoteId: "quote-new",
          toAmount: "1980",
          toCurrency: FiatToken.MXN
        }))
      } as never;

      await expect(
        registerAlfredpayOfframp(context(), { resolveCustomerId: async () => "customer-1", service })
      ).rejects.toThrow("Created Alfredpay offramp order drifted");
      expect(createOrder).toHaveBeenCalledTimes(1);
    }
  });
});
