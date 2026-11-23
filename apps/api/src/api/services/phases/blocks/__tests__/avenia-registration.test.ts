import { describe, expect, it, spyOn } from "bun:test";
import { BrlaCurrency, type Limit, RampDirection } from "@vortexfi/shared";
import logger from "../../../../../config/logger";
import {
  type AveniaRegistrationDependencies,
  createAveniaOnrampTicket,
  validateAveniaLimits,
  validateAveniaOfframpRecipient
} from "../core/avenia-registration";
import { FinancialOperationRejectedError } from "../core/financial-operation";

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

    const brlLimitError = await validateAveniaLimits(
      "80",
      [limit(BrlaCurrency.BRL, { maxFiatIn: "100" })],
      RampDirection.BUY,
      "123.456.789-01",
      deps
    ).catch(error => error);
    expect(brlLimitError).toBeInstanceOf(FinancialOperationRejectedError);
    expect(brlLimitError).toMatchObject({ message: "Amount exceeds BRL limit.", status: 400, type: "provider_limit_exceeded" });

    const globalLimitError = await validateAveniaLimits(
      "20",
      [limit(BrlaCurrency.BRL), limit("*", { maxFiatOut: "10" })],
      RampDirection.SELL,
      "123.456.789-01",
      deps
    ).catch(error => error);
    expect(globalLimitError).toBeInstanceOf(FinancialOperationRejectedError);
    expect(globalLimitError).toMatchObject({
      message: "Amount exceeds global limit.",
      status: 400,
      type: "provider_limit_exceeded"
    });
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
      brCode: "pix-code",
      subAccountId: "subaccount-1"
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

  it("keeps the Pix key and both tax IDs out of the logs on every recipient rejection", async () => {
    const pixKey = "client-pix-key";
    const failingLookup = {
      ...dependencies().aveniaApi,
      validatePixKey: async () => {
        throw new Error("Request failed with status '400'.");
      }
    } as AveniaRegistrationDependencies["aveniaApi"];
    const warn = spyOn(logger, "warn");
    try {
      for (const [receiverTaxId, deps] of [
        ["123.456.789-00", dependencies({ aveniaApi: failingLookup })], // lookup fails
        ["12.345.678/0001-90", dependencies()], // CNPJ against a masked CPF: not comparable
        ["123.456.780-00", dependencies()] // masked owner does not match
      ] as const) {
        await expect(validateAveniaOfframpRecipient("12345678901", pixKey, receiverTaxId, "499.25", deps)).rejects.toThrow(
          "Invalid pixKey or receiverTaxId."
        );
      }

      const logged = warn.mock.calls.map(call => call.map(String).join(" ")).join("\n");
      expect(warn).toHaveBeenCalledTimes(3);
      for (const secret of [pixKey, "456789", "12345678000190", "12345678000"]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      warn.mockRestore();
    }
  });
});
