import { describe, expect, it } from "bun:test";
import { startAlfredpayOfframp } from "../phases/alfredpay-offramp/lifecycle";

function context(state: Record<string, unknown>, quoteId = "quote-1") {
  return {
    metadata: { quoteId },
    ownState: undefined,
    quote: {} as never,
    state: state as never
  } as never;
}

describe("Alfredpay offramp start lifecycle", () => {
  it("is idempotent once registration has created the provider order", async () => {
    expect(await startAlfredpayOfframp(context({ alfredpayTransactionId: "transaction-1" }, ""))).toEqual({});
  });

  it("retains defensive validation when no provider transaction exists", async () => {
    await expect(startAlfredpayOfframp(context({}))).rejects.toThrow("Missing Alfredpay user ID in ramp state");
    await expect(startAlfredpayOfframp(context({}, ""))).rejects.toThrow("Missing Alfredpay quote ID in metadata");
  });
});
