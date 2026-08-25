import { describe, expect, it, mock } from "bun:test";
import { registerAlfredpayMint } from "../phases/alfredpay-mint/registration";

const resolveAlfredpayCustomerId = mock(async () => "alfredpay-customer-1");

describe("Alfredpay onramp registration", () => {
  it("resolves the authenticated provider customer without creating an order", async () => {
    const result = await registerAlfredpayMint(
      {
        authenticatedUser: { id: "user-1" },
        input: {},
        metadata: { currency: "MXN" } as never,
        quote: {} as never,
        signingAccounts: []
      },
      { resolveCustomerId: resolveAlfredpayCustomerId }
    );

    expect(resolveAlfredpayCustomerId).toHaveBeenCalledWith("MXN", "user-1");
    expect(result).toEqual({ facts: { userId: "alfredpay-customer-1" } });
  });
});
