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

export const E2E_RAMP_ID = "ramp-e2e-1";
export const E2E_USER_ID = "user-e2e-1";
// Plausible static Pix "copia e cola" BR Code, as returned by the API in RampProcess.depositQrCode.
export const E2E_DEPOSIT_QR_CODE =
  "00020126390014br.gov.bcb.pix0117vortex@example.com5204000053039865406100.005802BR5906VORTEX6009SAO PAULO62140510ramp2e2e0163049B2D";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// One unsigned EVM transaction as produced by the API's avenia-to-evm-base onramp route
// (see apps/api/src/api/services/transactions/onramp/routes/avenia-to-evm-base.ts):
// EvmTransactionData on Base, signed by the EVM ephemeral account.
function buildUnsignedEvmTx(signer: string, nonce: number, phase: string) {
  return {
    meta: {},
    network: "base",
    nonce,
    phase,
    signer,
    txData: {
      data: `0xa9059cbb${"00".repeat(12)}${signer.slice(2).toLowerCase()}${"00".repeat(30)}04c4`,
      gas: "150000",
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "1000000000",
      nonce,
      to: BASE_USDC,
      value: "0"
    }
  };
}

// Mirrors RampProcess (packages/shared/src/endpoints/ramp.endpoints.ts) for a BUY BRL -> Base USDC ramp.
export function buildRampProcess(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date().toISOString(),
    currentPhase: "initial",
    depositQrCode: E2E_DEPOSIT_QR_CODE,
    from: "pix",
    id: E2E_RAMP_ID,
    inputAmount: "100",
    inputCurrency: "BRL",
    outputAmount: "25.5",
    outputCurrency: "USDC",
    paymentMethod: "pix",
    quoteId: "quote-e2e-1",
    to: "base",
    type: "BUY",
    unsignedTxs: [],
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

// Phases mirror the real BRL -> USDC-on-Base onramp preparation (all Base txs signed by the EVM ephemeral).
const ONRAMP_TX_PHASES = [
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "destinationTransfer",
  "baseCleanupBrla",
  "baseCleanupUsdc"
];

interface MockBackendOptions {
  // Called for POST /v1/quotes; return a JSON body + status. Defaults to echoing the
  // request into a successful quote.
  quotes?: (requestBody: Record<string, unknown>) => { status: number; body: unknown };
  // How many GET /v1/ramp/:id polls report an in-progress ramp before flipping to COMPLETE.
  // Default 1: the progress page's immediate poll sees PENDING, the next one (after ~5s) sees COMPLETE.
  pendingStatusPolls?: number;
}

// Intercepts all traffic to the API origin (http://localhost:3000) so journeys run
// without a backend, and blocks third-party endpoints that would make runs
// non-deterministic (token lists, walletconnect telemetry). The app has graceful
// fallbacks for all of them.
export async function mockBackend(page: Page, options: MockBackendOptions = {}) {
  const quoteRequests: Array<Record<string, unknown>> = [];
  const brlaGetUserRequests: string[] = [];
  const registerRequests: Array<Record<string, unknown>> = [];
  const updateRequests: Array<Record<string, unknown>> = [];
  const startRequests: Array<Record<string, unknown>> = [];

  // The last successfully created quote, served back on GET /v1/quotes/:id.
  let lastQuote: Record<string, unknown> | undefined;
  let statusPollCount = 0;

  await page.route("http://localhost:3000/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const fulfillJson = (body: unknown, status = 200) => route.fulfill({ json: body as object, status });

    if (path === "/v1/quotes" && method === "POST") {
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
      if (result.status === 200) {
        lastQuote = result.body as Record<string, unknown>;
      }
      await fulfillJson(result.body, result.status);
      return;
    }

    if (path.startsWith("/v1/quotes/") && method === "GET") {
      const quoteId = path.split("/").pop() as string;
      await fulfillJson(lastQuote?.id === quoteId ? lastQuote : buildQuoteResponse({ id: quoteId }));
      return;
    }

    // Auth: email/OTP login (shapes mirror apps/api/src/api/controllers/auth.controller.ts).
    if (path === "/v1/auth/check-email" && method === "GET") {
      await fulfillJson({ action: "signup", exists: false });
      return;
    }
    if (path === "/v1/auth/request-otp" && method === "POST") {
      await fulfillJson({ message: "OTP sent" });
      return;
    }
    if (path === "/v1/auth/verify-otp" && method === "POST") {
      await fulfillJson({
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        success: true,
        user_id: E2E_USER_ID
      });
      return;
    }
    if (path === "/v1/auth/verify" && method === "POST") {
      await fulfillJson({ user_id: E2E_USER_ID, valid: true });
      return;
    }
    if (path === "/v1/auth/refresh" && method === "POST") {
      await fulfillJson({ access_token: "e2e-access-token", refresh_token: "e2e-refresh-token", success: true });
      return;
    }

    // Avenia/BRLA KYC gate: an existing, KYC-confirmed user (BrlaGetUserResponse shape),
    // so validateKyc reports kycNeeded=false and the ramp can proceed to the summary.
    if (path === "/v1/brla/getUser" && method === "GET") {
      brlaGetUserRequests.push(url.searchParams.get("taxId") ?? "");
      await fulfillJson({
        evmAddress: "0x9d1B0C3A79cB3F44a03cC7C39a54Db19E22C6A9E",
        identityStatus: "CONFIRMED",
        kycLevel: 1,
        subAccountId: "subaccount-e2e-1"
      });
      return;
    }
    if (path === "/v1/brla/getUserRemainingLimit" && method === "GET") {
      await fulfillJson({ remainingLimit: 100000 });
      return;
    }

    // Ramp lifecycle (RampProcess shapes from packages/shared/src/endpoints/ramp.endpoints.ts).
    if (path === "/v1/ramp/register" && method === "POST") {
      const body = request.postDataJSON() as {
        signingAccounts?: Array<{ address: string; type: string }>;
      } & Record<string, unknown>;
      registerRequests.push(body);
      const evmEphemeral = body.signingAccounts?.find(account => account.type === "EVM")?.address ?? BASE_USDC;
      await fulfillJson(
        buildRampProcess({
          unsignedTxs: ONRAMP_TX_PHASES.map((phase, index) => buildUnsignedEvmTx(evmEphemeral, index, phase))
        })
      );
      return;
    }
    if (path === "/v1/ramp/update" && method === "POST") {
      updateRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson(buildRampProcess());
      return;
    }
    if (path === "/v1/ramp/start" && method === "POST") {
      startRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson(buildRampProcess({ currentPhase: "brlaOnrampMint", status: "PENDING" }));
      return;
    }
    if (path === `/v1/ramp/${E2E_RAMP_ID}` && method === "GET") {
      statusPollCount++;
      const complete = statusPollCount > (options.pendingStatusPolls ?? 1);
      // GetRampStatusResponse = RampProcess + fee breakdown fields.
      await fulfillJson(
        buildRampProcess({
          anchorFeeFiat: "0.5",
          anchorFeeUsd: "0.1",
          currentPhase: complete ? "complete" : "brlaOnrampMint",
          feeCurrency: "BRL",
          networkFeeFiat: "0.2",
          networkFeeUsd: "0.04",
          partnerFeeFiat: "0",
          partnerFeeUsd: "0",
          processingFeeFiat: "0.5",
          processingFeeUsd: "0.1",
          status: complete ? "COMPLETE" : "PENDING",
          totalFeeFiat: "0.7",
          totalFeeUsd: "0.14",
          vortexFeeFiat: "0",
          vortexFeeUsd: "0"
        })
      );
      return;
    }

    await route.fulfill({ json: {}, status: 404 });
  });

  // The frontend pre-signs the ephemeral-account transactions locally with viem, which
  // issues eth_chainId to the network's RPC before signing (signing itself is offline).
  // Answer those RPC calls hermetically for Base (0x2105).
  const answerRpc = (body: { id?: number; method?: string } | Array<{ id?: number; method?: string }>) => {
    const answerOne = (req: { id?: number; method?: string }) => ({
      id: req.id ?? 1,
      jsonrpc: "2.0",
      result: req.method === "eth_chainId" ? "0x2105" : null
    });
    return Array.isArray(body) ? body.map(answerOne) : answerOne(body);
  };
  for (const rpcPattern of ["https://base-mainnet.g.alchemy.com/**", "https://mainnet.base.org/**"]) {
    await page.route(rpcPattern, async route => {
      const body = route.request().postDataJSON() as Parameters<typeof answerRpc>[0];
      await route.fulfill({ json: answerRpc(body) });
    });
  }

  // SquidRouter token list: the app falls back to its static token config on failure.
  await page.route("https://v2.api.squidrouter.com/**", route => route.abort());
  // WalletConnect/AppKit remote config and telemetry.
  await page.route("https://api.web3modal.org/**", route => route.abort());
  await page.route("https://pulse.walletconnect.org/**", route => route.abort());

  return { brlaGetUserRequests, quoteRequests, registerRequests, startRequests, updateRequests };
}
