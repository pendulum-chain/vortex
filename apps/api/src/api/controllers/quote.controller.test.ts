import { describe, expect, it } from "bun:test";
import { buildQuoteRequestMetadata } from "./quote.controller";

describe("buildQuoteRequestMetadata", () => {
  it("attributes successful quote events to the impersonation session", () => {
    const metadata = buildQuoteRequestMetadata(
      {
        body: { inputAmount: "100", inputCurrency: "USDC", outputCurrency: "BRL", rampType: "SELL" },
        impersonation: {
          actorProfileId: "actor-1",
          expiresAt: new Date("2026-08-07T12:00:00.000Z"),
          sessionId: "session-1",
          targetEmail: "target@example.com",
          targetProfileId: "target-1"
        },
        method: "POST",
        path: "/v1/quotes"
      },
      "quote_create"
    );

    expect(metadata).toEqual({
      impersonationSessionId: "session-1",
      impersonatorProfileId: "actor-1",
      requestBodyInputAmount: "100",
      requestBodyInputCurrency: "USDC",
      requestBodyOutputCurrency: "BRL",
      requestBodyRampType: "SELL",
      requestMethod: "POST",
      requestPath: "/v1/quotes"
    });
  });
});
