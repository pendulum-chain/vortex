import { describe, expect, test } from "bun:test";
import { QuoteError } from "@vortexfi/shared";

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

// A drained BRL pool is an operational state, not a deployment regression. Only SELL runs into it, so any other
// failure, including the same answer on BUY, must stay loud.
function isInconclusive(direction: string, status: number, body: string): boolean {
  if (direction !== "SELL" || status !== 500) return false;
  try {
    return JSON.parse(body).message === QuoteError.LowLiquidity;
  } catch {
    return false;
  }
}

describe("inconclusive quote answers", () => {
  const lowLiquidity = JSON.stringify({ code: 500, message: QuoteError.LowLiquidity });

  test("tolerates only the low-liquidity answer to a SELL quote", () => {
    expect(isInconclusive("SELL", 500, lowLiquidity)).toBe(true);
    expect(isInconclusive("BUY", 500, lowLiquidity)).toBe(false);
    expect(isInconclusive("SELL", 503, lowLiquidity)).toBe(false);
    expect(isInconclusive("SELL", 500, JSON.stringify({ code: 500, message: "Internal server error" }))).toBe(false);
    expect(isInconclusive("SELL", 500, JSON.stringify({ errors: [QuoteError.LowLiquidity], message: "" }))).toBe(false);
    expect(isInconclusive("SELL", 500, `<html>${QuoteError.LowLiquidity}</html>`)).toBe(false);
  });
});

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
          if (isInconclusive(quoteCase.direction, response.status, responseText)) {
            // GitHub Actions turns this line into an annotation on the otherwise green run.
            console.log(
              `::warning title=Quote smoke test inconclusive::${quoteCase.direction} on ${apiBaseUrl}: ${QuoteError.LowLiquidity}`,
            );
            return;
          }
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
