import { describe, expect, it } from "bun:test";
import { EphemeralAccountType } from "@vortexfi/shared";
import { createRegisterAveniaMint } from "../phases/avenia-mint/registration";

describe("BRL AssetHub Avenia registration", () => {
  it("owns the derived tax ID, ticket, and PIX artifact", async () => {
    const register = createRegisterAveniaMint({
      createTicket: async (taxId, quote, amount) => {
        expect([taxId, quote.id, amount]).toEqual(["12345678901", "quote-1", "100"]);
        return { aveniaTicketId: "ticket-1", brCode: "pix-code" };
      },
      resolveAccount: async () => ({ taxId: "12345678901" }) as never
    });
    const result = await register({
      authenticatedUser: { id: "user-1" },
      input: { taxId: "123.456.789-01" },
      metadata: {} as never,
      quote: { id: "quote-1", inputAmount: "100" } as never,
      signingAccounts: [
        { address: "0xevm", type: EphemeralAccountType.EVM },
        { address: "5substrate", type: EphemeralAccountType.Substrate }
      ]
    });
    expect(result).toEqual({
      facts: { aveniaTicketId: "ticket-1", taxId: "12345678901" },
      responseArtifacts: { depositQrCode: "pix-code" }
    });
  });
});
