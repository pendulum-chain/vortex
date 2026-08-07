import { describe, expect, test } from "bun:test";

const apiBaseUrls = (process.env.VORTEX_QUOTE_SMOKE_URLS ?? "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const quoteCases = [
  {
    direction: "BUY",
    request: {
      from: "pix",
      inputAmount: "100",
      inputCurrency: "BRL",
      network: "polygon",
      outputCurrency: "USDT",
      paymentMethod: "pix",
      rampType: "BUY",
      to: "polygon",
    },
  },
  {
    direction: "SELL",
    request: {
      from: "polygon",
      inputAmount: "20",
      inputCurrency: "USDT",
      network: "polygon",
      outputCurrency: "BRL",
      paymentMethod: "pix",
      rampType: "SELL",
      to: "pix",
    },
  },
] as const;

interface QuoteResponse {
  expiresAt: string;
  from: string;
  id: string;
  inputAmount: string;
  inputCurrency: string;
  network: string;
  outputAmount: string;
  outputCurrency: string;
  paymentMethod: string;
  rampType: string;
  to: string;
}

describe.skipIf(apiBaseUrls.length === 0)("deployed quote API", () => {
  test("has at least one deployment configured", () => {
    expect(apiBaseUrls.length).toBeGreaterThan(0);
  });

  for (const apiBaseUrl of apiBaseUrls) {
    for (const quoteCase of quoteCases) {
      test(`${apiBaseUrl} serves a cross-chain ${quoteCase.direction} quote`, async () => {
        const response = await fetch(`${apiBaseUrl}/v1/quotes`, {
          body: JSON.stringify(quoteCase.request),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(25_000),
        });
        const responseText = await response.text();

        if (response.status !== 201) {
          throw new Error(
            `${quoteCase.direction} quote failed on ${apiBaseUrl}: HTTP ${response.status} ${responseText}`,
          );
        }

        const quote = JSON.parse(responseText) as QuoteResponse;
        expect(quote).toMatchObject({
          from: quoteCase.request.from,
          inputCurrency: quoteCase.request.inputCurrency,
          network: quoteCase.request.network,
          outputCurrency: quoteCase.request.outputCurrency,
          paymentMethod: quoteCase.request.paymentMethod,
          rampType: quoteCase.request.rampType,
          to: quoteCase.request.to,
        });
        expect(quote.id.length).toBeGreaterThan(0);
        expect(Number(quote.inputAmount)).toBe(
          Number(quoteCase.request.inputAmount),
        );
        expect(Number(quote.outputAmount)).toBeGreaterThan(0);
        expect(Date.parse(quote.expiresAt)).toBeGreaterThan(Date.now());
      }, 30_000);
    }
  }
});
