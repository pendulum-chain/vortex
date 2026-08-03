import { describe, expect, it } from "bun:test";
import { BrlaCurrency, type Limit, RampDirection } from "@vortexfi/shared";
import {
  type AveniaRegistrationDependencies,
  createAveniaOnrampTicket,
  validateAveniaLimits,
  validateAveniaOfframpRecipient
} from "../core/avenia-registration";

function limit(currency: string, overrides: Partial<Limit> = {}): Limit {
  return {
    currency,
    maxChainIn: "0",
    maxChainOut: "0",
    maxFiatIn: "1000",
    maxFiatOut: "1000",
    usedLimit: { month: 7, usedChainIn: "0", usedChainOut: "0", usedFiatIn: "0", usedFiatOut: "0", year: 2026 },
    ...overrides
  };
}

function dependencies(overrides: Partial<AveniaRegistrationDependencies> = {}): AveniaRegistrationDependencies {
  return {
    aveniaApi: {
      createPayInQuote: async () => ({ quoteToken: "provider-quote" }) as never,
      createPixInputTicket: async () => ({ brCode: "pix-code", id: "ticket-1" }) as never,
      getSubaccountUsedLimit: async () => ({ limitInfo: { limits: [limit(BrlaCurrency.BRL)] } }) as never,
      subaccountInfo: async () =>
        ({ brCode: "trusted-code", wallets: [{ chain: "EVM", walletAddress: "0x1111111111111111111111111111111111111111" }] }) as never,
      validatePixKey: async () => ({ taxId: "***456789**" }) as never
    },
    convertBrlToUsd: async amount => amount,
    findAveniaCustomer: async () => ({ providerSubaccountId: "subaccount-1" }),
    findPendingRamps: async () => [],
    ...overrides
  };
}

describe("Avenia block registration", () => {
  it("counts pending volume in BRL and rejects BRL and global limit overflow", async () => {
    const deps = dependencies({
      convertBrlToUsd: async amount => String(Number(amount) / 5),
      findPendingRamps: async () => [{ quote: { inputAmount: "25", outputAmount: "40" } }]
    });

    await expect(
      validateAveniaLimits(
        "80",
        [limit(BrlaCurrency.BRL, { maxFiatIn: "100" })],
        RampDirection.BUY,
        "123.456.789-01",
        deps
      )
    ).rejects.toThrow("Amount exceeds BRL limit.");
    await expect(
      validateAveniaLimits(
        "20",
        [limit(BrlaCurrency.BRL), limit("*", { maxFiatOut: "10" })],
        RampDirection.SELL,
        "123.456.789-01",
        deps
      )
    ).rejects.toThrow("Amount exceeds global limit.");
  });

  it("creates the onramp ticket for the trusted subaccount with unchanged metadata", async () => {
    const calls: unknown[][] = [];
    const deps = dependencies({
      aveniaApi: {
        ...dependencies().aveniaApi,
        createPayInQuote: async request => {
          calls.push(["quote", request]);
          return { quoteToken: "provider-quote" } as never;
        },
        createPixInputTicket: async (request, subAccountId) => {
          calls.push(["ticket", request, subAccountId]);
          return { brCode: "pix-code", id: "ticket-1" } as never;
        }
      }
    });

    await expect(createAveniaOnrampTicket("12345678901", { id: "abcdefgh-rest" }, "100", deps)).resolves.toEqual({
      aveniaTicketId: "ticket-1",
      brCode: "pix-code"
    });
    expect(calls[0]).toEqual([
      "quote",
      {
        inputAmount: "100",
        inputCurrency: BrlaCurrency.BRL,
        inputPaymentMethod: "PIX",
        inputThirdParty: false,
        outputCurrency: BrlaCurrency.BRLA,
        outputPaymentMethod: "INTERNAL",
        outputThirdParty: false,
        subAccountId: "subaccount-1"
      }
    ]);
    expect(calls[1]).toEqual([
      "ticket",
      {
        quoteToken: "provider-quote",
        ticketBlockchainOutput: { beneficiaryWalletId: "00000000-0000-0000-0000-000000000000" },
        ticketBrlPixInput: { additionalData: "abcdefgh" }
      },
      "subaccount-1"
    ]);
  });

  it("accepts a matching masked recipient and returns only the provider-trusted wallet and code", async () => {
    const result = await validateAveniaOfframpRecipient(
      "12345678901",
      "client-pix-key",
      "123.456.789-00",
      "499.25",
      dependencies()
    );

    expect(result).toEqual({
      brCode: "trusted-code",
      wallets: { evm: "0x1111111111111111111111111111111111111111" }
    });
  });

  it("returns one generic error when the masked PIX owner does not match", async () => {
    await expect(
      validateAveniaOfframpRecipient(
        "12345678901",
        "client-pix-key",
        "123.456.780-00",
        "499.25",
        dependencies()
      )
    ).rejects.toThrow("Invalid pixKey or receiverTaxId.");
  });
});
