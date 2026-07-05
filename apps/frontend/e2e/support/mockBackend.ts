import { Page } from "@playwright/test";

// Mirrors the QuoteResponse shape served by the API (see src/test/fixtures.ts).
export function buildQuoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    anchorFeeFiat: "0.5",
    anchorFeeUsd: "0.1",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    feeCurrency: "BRL",
    from: "pix",
    id: "quote-e2e-1",
    inputAmount: "100",
    inputCurrency: "BRL",
    network: "base",
    networkFeeFiat: "0.2",
    networkFeeUsd: "0.04",
    outputAmount: "25.5",
    outputCurrency: "USDC",
    partnerFeeFiat: "0",
    partnerFeeUsd: "0",
    paymentMethod: "pix",
    processingFeeFiat: "0.5",
    processingFeeUsd: "0.1",
    rampType: "BUY",
    to: "base",
    totalFeeFiat: "0.7",
    totalFeeUsd: "0.14",
    vortexFeeFiat: "0",
    vortexFeeUsd: "0",
    ...overrides
  };
}

interface MockBackendOptions {
  // Called for POST /v1/quotes; return a JSON body + status. Defaults to echoing the
  // request into a successful quote.
  quotes?: (requestBody: Record<string, unknown>) => { status: number; body: unknown };
}

// Intercepts all traffic to the API origin (http://localhost:3000) so journeys run
// without a backend, and blocks third-party endpoints that would make runs
// non-deterministic (token lists, walletconnect telemetry). The app has graceful
// fallbacks for all of them.
export async function mockBackend(page: Page, options: MockBackendOptions = {}) {
  const quoteRequests: Array<Record<string, unknown>> = [];

  await page.route("http://localhost:3000/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/v1/quotes" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      quoteRequests.push(body);
      const result = options.quotes?.(body) ?? {
        body: buildQuoteResponse({
          inputAmount: body.inputAmount,
          inputCurrency: body.inputCurrency,
          outputCurrency: body.outputCurrency,
          rampType: body.rampType
        }),
        status: 200
      };
      await route.fulfill({ json: result.body as object, status: result.status });
      return;
    }

    await route.fulfill({ json: {}, status: 404 });
  });

  // SquidRouter token list: the app falls back to its static token config on failure.
  await page.route("https://v2.api.squidrouter.com/**", route => route.abort());
  // WalletConnect/AppKit remote config and telemetry.
  await page.route("https://api.web3modal.org/**", route => route.abort());
  await page.route("https://pulse.walletconnect.org/**", route => route.abort());

  return { quoteRequests };
}
