import { describe, expect, it } from "bun:test";
import { createRegisterAveniaOfframpPayout } from "../phases/avenia-offramp-payout/registration";

const validationCalls: unknown[][] = [];

const register = createRegisterAveniaOfframpPayout({
  resolveAccount: async () => ({ subAccountId: "subaccount-1", taxId: "12345678901" }) as never,
  validateRecipient: async (...args) => {
    validationCalls.push(args);
    return { brCode: "trusted-code", wallets: { evm: "0x1111111111111111111111111111111111111111" } };
  }
});

describe("AssetHub BRL payout registration", () => {
  it("derives identity and trusted payout wallet while validating PIX ownership and limits", async () => {
    const result = await register({
      authenticatedUser: { id: "user-1" },
      input: {
        brlaEvmAddress: "0x9999999999999999999999999999999999999999",
        pixDestination: "pix-key",
        receiverTaxId: "123.456.789-00",
        taxId: "client-value"
      },
      metadata: {} as never,
      quote: { outputAmount: "499.25" } as never,
      signingAccounts: []
    });
    expect(validationCalls.at(-1)).toEqual(["12345678901", "pix-key", "12345678900", "499.25"]);
    expect(result).toEqual({
      facts: {
        brlaEvmAddress: "0x1111111111111111111111111111111111111111",
        pixDestination: "pix-key",
        receiverTaxId: "12345678900",
        subAccountId: "subaccount-1",
        taxId: "12345678901"
      },
      responseArtifacts: { depositQrCode: "trusted-code" }
    });
  });
});
