import { describe, expect, it } from "bun:test";
import { createRegisterAveniaMint } from "../phases/avenia-mint/registration";

describe("BRL Base Avenia registration", () => {
  it("owns customer resolution, ticket creation, and PIX artifacts", async () => {
    const register = createRegisterAveniaMint({
      createTicket: async () => ({
        aveniaTicketId: "ticket-base",
        brCode: "pix-base",
        subAccountId: "subaccount-base"
      }),
      resolveAccount: async () => ({ taxId: "12345678901" }) as never
    });
    const registered = await register({
      authenticatedUser: { id: "user-1" },
      input: { taxId: "123.456.789-01" },
      metadata: {} as never,
      quote: { inputAmount: "100" } as never,
      signingAccounts: []
    });

    expect(registered.facts).toEqual({
      aveniaTicketId: "ticket-base",
      subAccountId: "subaccount-base",
      taxId: "12345678901"
    });
    expect(registered.responseArtifacts).toEqual({ depositQrCode: "pix-base" });
  });
});
