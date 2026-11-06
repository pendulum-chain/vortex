import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Networks, type QuoteResponse, RampDirection } from "@vortexfi/shared";
import ApiClientEvent from "../../models/apiClientEvent.model";
import quoteService from "../services/quote";
import { buildQuoteRequestMetadata, createQuote } from "./quote.controller";

describe("createQuote destinationAddress forwarding", () => {
  const destinationAddress = "0x000000000000000000000000000000000000dEaD";

  afterEach(() => {
    mock.restore();
  });

  async function forwardedRequest(body: Record<string, unknown>) {
    const createQuoteSpy = spyOn(quoteService, "createQuote").mockResolvedValue({ id: "quote-1" } as QuoteResponse);
    spyOn(ApiClientEvent, "create").mockResolvedValue({} as never);
    const res = { json: mock(() => res), status: mock(() => res) };
    const next = mock(() => undefined);

    await createQuote({ body, method: "POST", path: "/v1/quotes" } as never, res as never, next);

    expect(next).not.toHaveBeenCalled();
    return createQuoteSpy.mock.calls[0][0];
  }

  it("forwards it for a BUY on Robinhood Chain", async () => {
    const request = await forwardedRequest({
      destinationAddress,
      from: "pix",
      inputAmount: "100",
      inputCurrency: "BRL",
      outputCurrency: "NVDA",
      rampType: RampDirection.BUY,
      to: Networks.Robinhood
    });
    expect(request.destinationAddress).toBe(destinationAddress);
  });

  it("drops it on a SELL and on every other network", async () => {
    const sell = await forwardedRequest({
      destinationAddress,
      from: Networks.Robinhood,
      inputAmount: "1",
      inputCurrency: "NVDA",
      outputCurrency: "BRL",
      rampType: RampDirection.SELL,
      to: "pix"
    });
    expect("destinationAddress" in sell).toBe(false);

    mock.restore();
    const otherNetwork = await forwardedRequest({
      destinationAddress,
      from: "pix",
      inputAmount: "100",
      inputCurrency: "BRL",
      outputCurrency: "USDC",
      rampType: RampDirection.BUY,
      to: Networks.Base
    });
    expect("destinationAddress" in otherNetwork).toBe(false);
  });
});

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
