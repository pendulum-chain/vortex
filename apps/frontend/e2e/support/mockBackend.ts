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
  // Full response body for POST /v1/ramp/register. Default: the BUY BRL onramp response.
  register?: (requestBody: Record<string, unknown>) => unknown;
  // Full response body for POST /v1/ramp/update. Default: a bare RampProcess.
  update?: (requestBody: Record<string, unknown>) => unknown;
  // Extra fields merged into every GET /v1/ramp/:id status response (e.g. SELL currencies).
  rampStatusOverrides?: (complete: boolean) => Record<string, unknown>;
  // Status served on GET /v1/alfredpay/alfredpayStatus (Alfredpay KYC gate). Default: SUCCESS.
  alfredpayStatus?: string;
  // Accounts served on GET /v1/alfredpay/fiatAccounts (AlfredpayListFiatAccountsResponse).
  // Alfredpay offramps require one: the summary's Confirm button stays disabled without a
  // selectable fiat account. Default: none configured (the route 404s like any unmatched path).
  fiatAccounts?: (country: string) => unknown;
}

// Intercepts all traffic to the API origin (http://localhost:3000) so journeys run
// without a backend, and blocks third-party endpoints that would make runs
// non-deterministic (token lists, walletconnect telemetry). The app has graceful
// fallbacks for all of them.
export async function mockBackend(page: Page, options: MockBackendOptions = {}) {
  const quoteRequests: Array<Record<string, unknown>> = [];
  const brlaGetUserRequests: string[] = [];
  const fiatAccountsRequests: string[] = [];
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

    // Alfredpay KYC gate: the alfredpayKyc machine's CheckingStatus step. SUCCESS means an
    // existing verified customer, so the KYC child completes immediately (the gate's happy path).
    if (path === "/v1/alfredpay/alfredpayStatus" && method === "GET") {
      await fulfillJson({ status: options.alfredpayStatus ?? "SUCCESS" });
      return;
    }

    // Alfredpay fiat accounts: the payout bank accounts registered with the anchor. On
    // offramps the summary's FiatAccountSelector lists these and registration sends the
    // chosen fiatAccountId.
    if (path === "/v1/alfredpay/fiatAccounts" && method === "GET" && options.fiatAccounts) {
      const country = url.searchParams.get("country") ?? "";
      fiatAccountsRequests.push(country);
      await fulfillJson(options.fiatAccounts(country));
      return;
    }

    // Ramp lifecycle (RampProcess shapes from packages/shared/src/endpoints/ramp.endpoints.ts).
    if (path === "/v1/ramp/register" && method === "POST") {
      const body = request.postDataJSON() as {
        signingAccounts?: Array<{ address: string; type: string }>;
      } & Record<string, unknown>;
      registerRequests.push(body);
      if (options.register) {
        await fulfillJson(options.register(body));
        return;
      }
      const evmEphemeral = body.signingAccounts?.find(account => account.type === "EVM")?.address ?? BASE_USDC;
      await fulfillJson(
        buildRampProcess({
          unsignedTxs: ONRAMP_TX_PHASES.map((phase, index) => buildUnsignedEvmTx(evmEphemeral, index, phase))
        })
      );
      return;
    }
    if (path === "/v1/ramp/update" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      updateRequests.push(body);
      await fulfillJson(options.update ? options.update(body) : buildRampProcess());
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
          vortexFeeUsd: "0",
          ...options.rampStatusOverrides?.(complete)
        })
      );
      return;
    }

    await route.fulfill({ json: {}, status: 404 });
  });

  // The app reads chain state through the networks' RPC endpoints (ephemeral signing issues
  // eth_chainId; offramps also read the user's token balance and wait for the receipt of the
  // user-broadcast transaction). Answer those calls hermetically per chain.
  type RpcRequest = { id?: number; method?: string; params?: unknown[] };
  const answerRpc = (chainIdHex: string) => (body: RpcRequest | RpcRequest[]) => {
    const answerOne = (req: RpcRequest) => {
      const hash = (req.params?.[0] as string) ?? `0x${"cd".repeat(32)}`;
      let result: unknown = null;
      switch (req.method) {
        case "eth_chainId":
          result = chainIdHex;
          break;
        // Token balance reads (balanceOf & friends): a comfortably large uint256.
        case "eth_call":
          result = `0x${(10n ** 24n).toString(16).padStart(64, "0")}`;
          break;
        case "eth_getBalance":
          result = "0xde0b6b3a7640000"; // 1 native token
          break;
        case "eth_blockNumber":
          result = "0x1";
          break;
        case "eth_getTransactionCount":
          result = "0x0";
          break;
        case "eth_estimateGas":
          result = "0x5208";
          break;
        case "eth_gasPrice":
        case "eth_maxPriorityFeePerGas":
          result = "0x3b9aca00";
          break;
        case "eth_getBlockByNumber":
          result = { baseFeePerGas: "0x1", number: "0x1" };
          break;
        // Answering the tx lookup marks user-broadcast hashes as regular (non-Safe) txs.
        case "eth_getTransactionByHash":
          result = { blockHash: `0x${"ef".repeat(32)}`, blockNumber: "0x1", from: null, hash, input: "0x", value: "0x0" };
          break;
        case "eth_getTransactionReceipt":
          result = {
            blockHash: `0x${"ef".repeat(32)}`,
            blockNumber: "0x1",
            contractAddress: null,
            cumulativeGasUsed: "0x5208",
            effectiveGasPrice: "0x3b9aca00",
            gasUsed: "0x5208",
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            status: "0x1",
            transactionHash: hash,
            transactionIndex: "0x0",
            type: "0x2"
          };
          break;
      }
      return { id: req.id ?? 1, jsonrpc: "2.0", result };
    };
    return Array.isArray(body) ? body.map(answerOne) : answerOne(body);
  };
  const rpcEndpoints: Array<{ chainIdHex: string; pattern: string }> = [
    { chainIdHex: "0x2105", pattern: "https://base-mainnet.g.alchemy.com/**" },
    { chainIdHex: "0x2105", pattern: "https://mainnet.base.org/**" },
    { chainIdHex: "0x89", pattern: "https://polygon-mainnet.g.alchemy.com/**" },
    { chainIdHex: "0x89", pattern: "https://polygon-rpc.com/**" }
  ];
  for (const { chainIdHex, pattern } of rpcEndpoints) {
    const answer = answerRpc(chainIdHex);
    await page.route(pattern, async route => {
      const body = route.request().postDataJSON() as Parameters<typeof answer>[0];
      await route.fulfill({ json: answer(body) });
    });
  }
  // Safe Wallet transaction service — never reached (eth_getTransactionByHash answers first),
  // but blocked so a code change cannot silently make runs non-hermetic.
  await page.route("https://safe-transaction-*.safe.global/**", route => route.abort());

  // Alchemy Data API (token balances by address): the wallet holds plenty of USDC on Base
  // and USDT on Polygon, so offramp balance gates pass. The balance fetcher keys results
  // by tokenAddress per queried network; entries not configured for a network are ignored.
  await page.route("https://api.g.alchemy.com/**", async route => {
    await route.fulfill({
      json: {
        data: {
          tokens: [
            { tokenAddress: BASE_USDC, tokenBalance: `0x${(1_000_000_000_000n).toString(16)}` },
            {
              tokenAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
              tokenBalance: `0x${(1_000_000_000_000n).toString(16)}`
            }
          ]
        }
      }
    });
  });

  // SquidRouter token list: the app falls back to its static token config on failure.
  await page.route("https://v2.api.squidrouter.com/**", route => route.abort());
  // WalletConnect/AppKit remote config and telemetry.
  await page.route("https://api.web3modal.org/**", route => route.abort());
  await page.route("https://pulse.walletconnect.org/**", route => route.abort());

  return { brlaGetUserRequests, fiatAccountsRequests, quoteRequests, registerRequests, startRequests, updateRequests };
}
