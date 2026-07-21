import type { Page } from "@playwright/test";
import { MOCK_WALLET_ADDRESS } from "./mockWallet";
import { E2E_USER_ID } from "./session";

export const APP_ORIGIN = "http://127.0.0.1:5174";
export const E2E_RAMP_ID = "ramp-e2e-1";
export const E2E_QUOTE_ID = "quote-e2e-1";
export const E2E_FIAT_ACCOUNT_ID = "fiat-account-e2e-mx";
export const E2E_FIAT_ACCOUNT_ID_2 = "fiat-account-e2e-mx-2";
/** USDC_RATES.MX in src/domain/transfer.ts — the rate the form inverts to size the payin. */
export const MX_USDC_RATE = 18.5;

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";

type OnboardingState = "approved" | "in_review" | "pending" | "rejected" | "started";

/**
 * One MX/Alfredpay account under an individual entity, as served by GET /v1/onboarding/status
 * (OnboardingStatusResponse in src/services/api/onboarding.service.ts). corridorFromProviderAccount
 * resolves by rail first, then provider + country — both are set so the corridor maps to MX
 * whichever branch runs; `state` (not `status`) is what the approval gate reads.
 */
export function buildOnboardingStatus(state: OnboardingState = "approved") {
  return {
    activeEntityId: "entity-e2e-1",
    entities: [
      {
        accounts: [
          {
            country: "MX",
            customerType: "individual",
            id: "acct-e2e-mx",
            kycCase: null,
            provider: "alfredpay",
            rail: "mxn",
            state,
            status: state
          }
        ],
        id: "entity-e2e-1",
        status: state,
        type: "individual"
      }
    ],
    selectionRequired: false
  };
}

export function buildMoneriumOnboardingStatus(state: OnboardingState = "approved", reauthenticationRequired = false) {
  return {
    activeEntityId: "entity-e2e-1",
    entities: [
      {
        accounts: [
          {
            country: null,
            customerType: "individual",
            error: reauthenticationRequired
              ? {
                  code: "MONERIUM_REAUTHENTICATION_REQUIRED",
                  message: "Monerium reauthentication is required"
                }
              : null,
            id: "acct-e2e-eu",
            kycCase: null,
            provider: "monerium",
            rail: "eur",
            state,
            status: state
          }
        ],
        id: "entity-e2e-1",
        status: state,
        type: "individual"
      }
    ],
    selectionRequired: false
  };
}

export function buildCompanyOnboardingStatus(provider: "alfredpay" | "avenia", country: "BR" | "MX", state: OnboardingState) {
  return {
    activeEntityId: "entity-e2e-company-1",
    entities: [
      {
        accounts: [
          {
            companyName: "Vortex E2E Ltda",
            country,
            customerType: "business",
            error: null,
            id: `acct-e2e-${country.toLowerCase()}-company`,
            kycCase: null,
            provider,
            rail: country === "BR" ? "pix" : "mxn",
            state,
            status: state,
            statusExternal: state
          }
        ],
        id: "entity-e2e-company-1",
        status: state,
        type: "business"
      }
    ],
    selectionRequired: false
  };
}

export function buildEmptyOnboardingStatus(companyMode = false) {
  return {
    activeEntityId: companyMode ? "entity-e2e-company-1" : "entity-e2e-1",
    entities: [
      {
        accounts: [],
        id: companyMode ? "entity-e2e-company-1" : "entity-e2e-1",
        status: "active",
        type: companyMode ? "business" : "individual"
      }
    ],
    selectionRequired: false
  };
}

/**
 * AlfredpayListFiatAccountsResponse is a bare array; selfRecipientsFromFiatAccounts reads these
 * fields and turns each account into its own "send to yourself" recipient. Two accounts, so the
 * recipient selector has something to choose between: the first is auto-selected, and picking the
 * second must change the fiatAccountId the offramp registers against.
 */
export function buildFiatAccounts() {
  return [
    {
      accountName: "Vortex E2E CLABE",
      accountNumber: "646180157000000004",
      accountType: "CLABE",
      createdAt: "2026-01-01T00:00:00.000Z",
      customerId: "alfred-customer-e2e-1",
      fiatAccountId: E2E_FIAT_ACCOUNT_ID,
      metadata: { accountHolderName: "Vortex E2E" },
      type: "SPEI"
    },
    {
      accountName: "Vortex E2E Savings",
      accountNumber: "646180157000000099",
      accountType: "CLABE",
      createdAt: "2026-01-02T00:00:00.000Z",
      customerId: "alfred-customer-e2e-1",
      fiatAccountId: E2E_FIAT_ACCOUNT_ID_2,
      metadata: { accountHolderName: "Vortex E2E" },
      type: "SPEI"
    }
  ];
}

/**
 * The SELL quote the dashboard's QuoteSummary and FundingMethods render. outputAmount is derived
 * from the requested inputAmount at the same rate the form used to size it, so fetchOfframpQuote's
 * refinement pass never fires and exactly one quote request is made.
 */
export function buildQuoteResponse(inputAmount: string, overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    feeCurrency: "MXN",
    from: "polygon",
    id: E2E_QUOTE_ID,
    inputAmount,
    inputCurrency: "USDC",
    network: "polygon",
    networkFeeFiat: "2.00",
    networkFeeUsd: "0.11",
    outputAmount: (Number(inputAmount) * MX_USDC_RATE).toFixed(2),
    outputCurrency: "MXN",
    paymentMethod: "spei",
    processingFeeFiat: "8.00",
    processingFeeUsd: "0.43",
    rampType: "SELL",
    to: "spei",
    totalFeeFiat: "10.00",
    totalFeeUsd: "0.54",
    ...overrides
  };
}

/** RampProcess (packages/shared/src/endpoints/ramp.endpoints.ts) for a SELL USDC-on-Polygon -> MXN ramp. */
export function buildRampProcess(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date().toISOString(),
    currentPhase: "initial",
    from: "polygon",
    id: E2E_RAMP_ID,
    inputAmount: "54.054054",
    inputCurrency: "USDC",
    outputAmount: "1000.00",
    outputCurrency: "MXN",
    paymentMethod: "spei",
    quoteId: E2E_QUOTE_ID,
    to: "spei",
    type: "SELL",
    unsignedTxs: [],
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Mirrors the API's evm-to-alfredpay offramp preparation on the direct Polygon no-permit path:
 * the USER wallet signs one squidRouterNoPermitTransfer, and the EVM ephemeral signs the
 * Alfredpay deposit transfer, its fallback (both nonce 0 — only one executes) and the cleanup.
 *
 * Every transaction is an EVM tx on Polygon on purpose. registerTransfer (src/machines/
 * transfer.actors.ts) opens a real WebSocket RPC for any ephemeral tx on Pendulum, Hydration or
 * substrate-format Moonbeam, which would make the run non-hermetic.
 */
export function buildSellUnsignedTxs(evmEphemeral: string) {
  const evmTx = (signer: string, nonce: number, phase: string) => ({
    meta: {},
    network: "polygon",
    nonce,
    phase,
    signer,
    txData: {
      data: `0xa9059cbb${"00".repeat(12)}${evmEphemeral.slice(2).toLowerCase()}${"00".repeat(30)}04c4`,
      gas: "150000",
      maxFeePerGas: "5000000000",
      maxPriorityFeePerGas: "5000000000",
      nonce,
      to: POLYGON_USDT,
      value: "0"
    }
  });
  return [
    evmTx(MOCK_WALLET_ADDRESS, 0, "squidRouterNoPermitTransfer"),
    evmTx(evmEphemeral, 0, "alfredpayOfframpTransfer"),
    evmTx(evmEphemeral, 0, "alfredpayOfframpTransferFallback"),
    evmTx(evmEphemeral, 1, "polygonCleanupAxlUsdc")
  ];
}

interface MockBackendOptions {
  onboardingState?: OnboardingState;
  companyMode?: boolean;
  selectionRequired?: boolean;
  // Full response for POST /v1/auth/verify-otp. Default: a successful session.
  verifyOtp?: (requestBody: Record<string, unknown>) => { status: number; body: unknown };
  // How many GET /v1/ramp/:id polls report an in-progress ramp before flipping to COMPLETE.
  pendingStatusPolls?: number;
  // Drives the Alfredpay MX KYC endpoints and, unless reflectOnboarding is false, makes
  // GET /v1/onboarding/status mirror KYC progress (empty → started once the customer exists →
  // in_review once submitted → approved).
  // Default onboarding status (an already-approved MX corridor) applies when this is unset.
  alfredpayKyc?: { reflectOnboarding?: boolean };
  aveniaKyb?: boolean;
  moneriumKyc?: boolean;
  moneriumRequireRefresh?: boolean;
  // Served as GET /v1/recipients → pendingInvitations (default: none).
  pendingInvitations?: Array<Record<string, unknown>>;
  // Initial provider-side payout accounts. Defaults to the two seeded MX accounts.
  fiatAccounts?: Array<Record<string, unknown>>;
}

// AlfredPayStatus values the machine branches on (packages/shared AlfredPayStatus).
const ALFREDPAY_SUCCESS = "SUCCESS";
const ALFREDPAY_VERIFYING = "VERIFYING";
// Customer exists but no KYC submission yet — a reopened wizard resumes into the details form.
const ALFREDPAY_CONSULTED = "CONSULTED";

// Chains the dashboard's wagmi config can reach (src/lib/wagmi.ts uses http() with no URL, so
// viem falls back to these per-chain defaults). Polygon is genuinely exercised — the user
// transaction's receipt is awaited through the wagmi transport, not the wallet — and mainnet is
// hit by ConnectKit's ENS lookup after connect.
const RPC_ENDPOINTS: Array<{ chainIdHex: string; pattern: string }> = [
  { chainIdHex: "0x89", pattern: "https://polygon.drpc.org/**" },
  { chainIdHex: "0x1", pattern: "https://eth.merkle.io/**" },
  { chainIdHex: "0xa4b1", pattern: "https://arb1.arbitrum.io/**" },
  { chainIdHex: "0x2105", pattern: "https://mainnet.base.org/**" }
];

// Third parties the app reaches for but does not need. main.tsx always mounts WagmiProvider +
// ConnectKitProvider, which probes for the Family wallet and loads the Coinbase Wallet SDK; the
// Topbar renders a connect button. index.html pulls a Google font. All have graceful fallbacks.
const THIRD_PARTY_BLOCKLIST = [
  "**/*.walletconnect.com/**",
  "**/*.walletconnect.org/**",
  "**/*.web3modal.org/**",
  "https://app.family.co/**",
  "https://cca-lite.coinbase.com/**",
  "https://fonts.googleapis.com/**",
  "https://fonts.gstatic.com/**"
];

type RpcRequest = { id?: number; method?: string; params?: unknown[] };

/** Reads one text field out of a multipart body — the uploads are FormData, not JSON. */
function multipartField(body: string | null, name: string): string {
  const match = body?.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`));
  return match?.[1] ?? "";
}

function answerRpc(chainIdHex: string) {
  const answerOne = (req: RpcRequest) => {
    const hash = (req.params?.[0] as string) ?? `0x${"cd".repeat(32)}`;
    let result: unknown = null;
    switch (req.method) {
      case "eth_chainId":
        result = chainIdHex;
        break;
      // Contract reads (ENS resolution): empty return data, which viem surfaces as a failed
      // read. ConnectKit falls back to the truncated address.
      case "eth_call":
        result = "0x";
        break;
      case "eth_blockNumber":
        result = "0x1";
        break;
      case "eth_getBlockByNumber":
        result = { baseFeePerGas: "0x1", number: "0x1" };
        break;
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
  return (body: RpcRequest | RpcRequest[]) => (Array.isArray(body) ? body.map(answerOne) : answerOne(body));
}

/**
 * Intercepts the API origin (http://localhost:3000) so specs run without a backend, answers the
 * chain RPCs hermetically, and aborts every other external request.
 *
 * Two escape hatches are recorded rather than tolerated: `unmatchedRequests` (an API path this
 * mock does not serve, 404ed) and `unexpectedExternalRequests` (any origin outside the app that
 * is not in THIRD_PARTY_BLOCKLIST). Specs assert both are empty, so a newly-called endpoint or a
 * changed default RPC URL fails the suite instead of silently reaching the network.
 */
export async function mockBackend(page: Page, options: MockBackendOptions = {}) {
  const requestOtpRequests: Array<Record<string, unknown>> = [];
  const verifyOtpRequests: Array<Record<string, unknown>> = [];
  const quoteRequests: Array<Record<string, unknown>> = [];
  const registerRequests: Array<Record<string, unknown>> = [];
  const updateRequests: Array<Record<string, unknown>> = [];
  const startRequests: Array<Record<string, unknown>> = [];
  const kycFormSubmissions: Array<Record<string, unknown>> = [];
  const kybFormSubmissions: Array<Record<string, unknown>> = [];
  const brlaCreateSubaccountRequests: Array<Record<string, unknown>> = [];
  const archiveInvitationRequests: Array<Record<string, unknown>> = [];
  const fiatAccountRequests: Array<Record<string, unknown>> = [];
  const unmatchedRequests: string[] = [];
  const unexpectedExternalRequests: string[] = [];
  const status = { polls: 0 };
  // Alfredpay KYC progress. Route handlers are Node closures, so a spec flips `kyc.approved`
  // between assertions and the browser's next poll (machine getKycStatus, or the card's
  // onboarding-status refetch) observes it — deterministic, no reliance on poll counts.
  const kyc = { approved: false, customerCreated: false, submitted: false };
  const kybUploads = { businessFiles: 0, relatedPersonFiles: 0 };
  // The fileType is the whole contract of these uploads: Alfredpay keys the document by it and
  // rejects an unknown value, so counting requests alone would not catch sending the wrong one.
  const kybFileTypes: string[] = [];
  const kybRelatedPersonFileTypes: string[] = [];
  const avenia = { approved: false, statusPolls: 0, submitted: false };
  const monerium = {
    approved: false,
    authorized: false,
    completed: false,
    startRequests: [] as Array<Record<string, unknown>>
  };
  const auth = { refreshes: 0 };
  let selectedCompany = options.companyMode ?? false;
  let hasActiveEntity = options.selectionRequired !== true;
  const fiatAccounts = [...(options.fiatAccounts ?? buildFiatAccounts())];

  // The real API keeps returning the ramp's unsignedTxs on /ramp/update; the signing step reads
  // the user-wallet transaction from that response.
  let unsignedTxs: unknown[] = [];

  // Registered first so the specific routes below take precedence: Playwright runs route
  // handlers in reverse registration order.
  await page.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith(APP_ORIGIN) || url.startsWith("data:") || url.startsWith("blob:")) {
      await route.continue();
      return;
    }
    unexpectedExternalRequests.push(url);
    await route.abort();
  });

  await page.route("http://localhost:3000/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const fulfillJson = (body: unknown, code = 200) => route.fulfill({ json: body as object, status: code });

    // Auth shapes mirror apps/api/src/api/controllers/auth.controller.ts: snake_case on the
    // wire, mapped to camelCase by src/services/api/auth.api.ts.
    if (path === "/v1/auth/request-otp" && method === "POST") {
      requestOtpRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({ message: "OTP sent" });
      return;
    }
    if (path === "/v1/auth/verify-otp" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      verifyOtpRequests.push(body);
      const result = options.verifyOtp?.(body) ?? {
        body: {
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          success: true,
          user_id: E2E_USER_ID
        },
        status: 200
      };
      await fulfillJson(result.body, result.status);
      return;
    }
    if (path === "/v1/auth/refresh" && method === "POST") {
      auth.refreshes += 1;
      await fulfillJson({ access_token: "e2e-access-token", refresh_token: "e2e-refresh-token", success: true });
      return;
    }

    if (path === "/v1/onboarding/active-entity" && method === "PUT") {
      const body = request.postDataJSON() as { type?: string };
      selectedCompany = body.type === "business";
      hasActiveEntity = true;
      await fulfillJson({
        activeEntityId: selectedCompany ? "entity-e2e-company-1" : "entity-e2e-1",
        type: selectedCompany ? "business" : "individual"
      });
      return;
    }

    if (path === "/v1/onboarding/status" && method === "GET") {
      if (!hasActiveEntity) {
        await fulfillJson({ activeEntityId: null, entities: [], selectionRequired: true });
        return;
      }
      if (options.selectionRequired) {
        await fulfillJson(buildEmptyOnboardingStatus(selectedCompany));
        return;
      }
      if (options.aveniaKyb) {
        await fulfillJson(
          avenia.submitted
            ? buildCompanyOnboardingStatus("avenia", "BR", avenia.approved ? "approved" : "in_review")
            : buildEmptyOnboardingStatus(true)
        );
        return;
      }
      if (options.moneriumKyc) {
        await fulfillJson(
          monerium.completed
            ? buildMoneriumOnboardingStatus(monerium.approved ? "approved" : "in_review", !monerium.authorized)
            : buildEmptyOnboardingStatus()
        );
        return;
      }
      if (!options.alfredpayKyc) {
        await fulfillJson(
          options.companyMode
            ? buildCompanyOnboardingStatus("alfredpay", "MX", options.onboardingState ?? "approved")
            : buildOnboardingStatus(options.onboardingState)
        );
        return;
      }
      // KYC test: reflect progress so the card tracks it (empty keeps the card action enabled for
      // reopen; in_review turns on the 15s background refetch that flips it to approved live).
      if (options.alfredpayKyc.reflectOnboarding === false) {
        await fulfillJson(buildEmptyOnboardingStatus(options.companyMode));
      } else if (kyc.approved) {
        await fulfillJson(
          options.companyMode ? buildCompanyOnboardingStatus("alfredpay", "MX", "approved") : buildOnboardingStatus("approved")
        );
      } else if (kyc.submitted) {
        await fulfillJson(
          options.companyMode
            ? buildCompanyOnboardingStatus("alfredpay", "MX", "in_review")
            : buildOnboardingStatus("in_review")
        );
      } else if (kyc.customerCreated) {
        // Real backend: createCustomer writes provider_customers.status = started (Consulted)
        // before any KYC data is submitted, so the aggregator reports `started` here — the card
        // must keep this resumable, not lock the user out.
        await fulfillJson(
          options.companyMode ? buildCompanyOnboardingStatus("alfredpay", "MX", "started") : buildOnboardingStatus("started")
        );
      } else {
        await fulfillJson(buildEmptyOnboardingStatus(options.companyMode));
      }
      return;
    }

    if (path === "/v1/monerium/status" && method === "GET" && options.moneriumKyc) {
      if (!monerium.authorized) {
        await fulfillJson(
          { message: "Monerium reauthentication is required", type: "MONERIUM_REAUTHENTICATION_REQUIRED" },
          404
        );
      } else {
        await fulfillJson({
          customerType: "individual",
          profileId: "monerium-profile-e2e",
          status: monerium.approved ? "APPROVED" : "PENDING",
          statusExternal: monerium.approved ? "approved" : "pending"
        });
      }
      return;
    }
    if (path === "/v1/monerium/oauth/start" && method === "POST" && options.moneriumKyc) {
      monerium.startRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({
        authorizationUrl: `${APP_ORIGIN}/monerium/callback?code=e2e-code&state=e2e-state`
      });
      return;
    }
    if (path === "/v1/monerium/oauth/complete" && method === "POST" && options.moneriumKyc) {
      if (options.moneriumRequireRefresh && request.headers().authorization === "Bearer eyJhbGciOiJub25lIn0.eyJleHAiOjF9.") {
        await fulfillJson({ error: "Access token expired" }, 401);
        return;
      }
      monerium.completed = true;
      monerium.authorized = true;
      await fulfillJson({
        customerType: "individual",
        profileId: "monerium-profile-e2e",
        status: "PENDING",
        statusExternal: "pending"
      });
      return;
    }

    // --- Alfredpay MX individual KYC (packages/kyc alfredpay machine drives this sequence) ---
    // getAlfredpayStatus (machine entry): 404 before a customer exists → CustomerDefinition;
    // once submitted → VERIFYING so a reopened wizard resumes into PollingStatus.
    if (path === "/v1/alfredpay/alfredpayStatus" && method === "GET") {
      if (!kyc.customerCreated) {
        await fulfillJson({ error: "Customer not found" }, 404);
      } else {
        await fulfillJson({
          country: "MX",
          creationTime: new Date().toISOString(),
          status: kyc.approved ? ALFREDPAY_SUCCESS : kyc.submitted ? ALFREDPAY_VERIFYING : ALFREDPAY_CONSULTED
        });
      }
      return;
    }
    if (path === "/v1/alfredpay/createIndividualCustomer" && method === "POST") {
      kyc.customerCreated = true;
      await fulfillJson({ createdAt: new Date().toISOString() });
      return;
    }
    if (path === "/v1/alfredpay/createBusinessCustomer" && method === "POST") {
      kyc.customerCreated = true;
      await fulfillJson({ createdAt: new Date().toISOString() });
      return;
    }
    if (path === "/v1/alfredpay/submitKycInformation" && method === "POST") {
      kycFormSubmissions.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({ submissionId: "kyc-submission-e2e-1" });
      return;
    }
    // Document uploads post multipart FormData — never call postDataJSON on these.
    if (path === "/v1/alfredpay/submitKycFile" && method === "POST") {
      await fulfillJson({ success: true });
      return;
    }
    if (path === "/v1/alfredpay/sendKycSubmission" && method === "POST") {
      kyc.submitted = true;
      await fulfillJson({ success: true });
      return;
    }
    if (path === "/v1/alfredpay/submitKybInformation" && method === "POST") {
      kybFormSubmissions.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({ submissionId: "kyb-submission-e2e-1" });
      return;
    }
    if (path === "/v1/alfredpay/submitKybFile" && method === "POST") {
      kybUploads.businessFiles += 1;
      kybFileTypes.push(multipartField(request.postData(), "fileType"));
      await fulfillJson({ success: true });
      return;
    }
    if (path === "/v1/alfredpay/findKybCustomerAndBusiness" && method === "GET") {
      await fulfillJson([
        { relatedPersons: [{ idRelatedPerson: "related-person-e2e-1" }], submissionId: "kyb-submission-e2e-1" }
      ]);
      return;
    }
    if (path === "/v1/alfredpay/submitKybRelatedPersonFile" && method === "POST") {
      kybUploads.relatedPersonFiles += 1;
      kybRelatedPersonFileTypes.push(multipartField(request.postData(), "fileType"));
      await fulfillJson({ success: true });
      return;
    }
    if (path === "/v1/alfredpay/sendKybSubmission" && method === "POST") {
      kyc.submitted = true;
      await fulfillJson({ success: true });
      return;
    }
    // getKycStatus (machine PollingStatus): VERIFYING keeps the machine polling; SUCCESS lands it
    // on VerificationDone. The spec flips kyc.approved to make approval "arrive".
    if (path === "/v1/alfredpay/getKycStatus" && method === "GET") {
      await fulfillJson({
        alfred_pay_id: "alfred-e2e-1",
        country: "MX",
        status: kyc.approved ? ALFREDPAY_SUCCESS : ALFREDPAY_VERIFYING,
        updated_at: new Date().toISOString()
      });
      return;
    }

    // --- Avenia BR company KYB (packages/kyc Avenia machine drives this sequence) ---
    if (path === "/v1/brla/getUser" && method === "GET" && options.aveniaKyb) {
      await fulfillJson({ error: "User not found" }, 404);
      return;
    }
    if (path === "/v1/brla/createSubaccount" && method === "POST" && options.aveniaKyb) {
      brlaCreateSubaccountRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({ subAccountId: "avenia-subaccount-e2e-1" });
      return;
    }
    if (path === "/v1/brla/kyb/new-level-1/web-sdk" && method === "POST" && options.aveniaKyb) {
      await fulfillJson({
        attemptId: "avenia-attempt-e2e-1",
        authorizedRepresentativeUrl: "https://hosted.avenia.example/representative",
        basicCompanyDataUrl: "https://hosted.avenia.example/company"
      });
      return;
    }
    if (path === "/v1/brla/kyb/attempt-status" && method === "GET" && options.aveniaKyb) {
      avenia.statusPolls += 1;
      avenia.submitted = true;
      await fulfillJson(avenia.approved ? { result: "APPROVED", status: "COMPLETED" } : { status: "PROCESSING" });
      return;
    }

    // Saved payout accounts: each becomes a "send to yourself" recipient. Only the approved
    // corridor (MX) is ever queried.
    if (path === "/v1/alfredpay/fiatAccounts" && method === "GET") {
      await fulfillJson(url.searchParams.get("country") === "MX" ? fiatAccounts : []);
      return;
    }
    if (path === "/v1/alfredpay/fiatAccounts" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      fiatAccountRequests.push(body);
      const fiatAccountId = `fiat-account-e2e-${fiatAccountRequests.length}`;
      fiatAccounts.push({
        ...body,
        customerId: "alfred-customer-e2e-1",
        fiatAccountId
      });
      await fulfillJson({ fiatAccountId }, 201);
      return;
    }
    // Third-party recipients: seeded pending invitations only, so the auto-selected
    // self-recipient stays selected in transfer specs.
    if (path === "/v1/recipients" && method === "GET") {
      // Archived invitations disappear from subsequent lists, like the real backend, so specs
      // can assert the user-visible outcome of removal rather than just the PATCH.
      const archivedIds = new Set(
        archiveInvitationRequests.filter(request => request.archived === true).map(request => request.id)
      );
      await fulfillJson({
        pendingInvitations: (options.pendingInvitations ?? []).filter(invitation => !archivedIds.has(invitation.id)),
        recipients: []
      });
      return;
    }
    if (path.startsWith("/v1/recipients/invitations/") && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      archiveInvitationRequests.push({ ...body, id: path.split("/").pop() });
      await fulfillJson({ archived: body.archived, id: path.split("/").pop() });
      return;
    }
    if (path === "/v1/recipients/invite" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      await fulfillJson({
        ...body,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        id: "invite-e2e-1",
        inviteeEmail: null,
        status: "pending",
        token: `e2e-${"long-token-".repeat(30)}`
      });
      return;
    }

    if (path === "/v1/quotes" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      quoteRequests.push(body);
      await fulfillJson(buildQuoteResponse(body.inputAmount as string));
      return;
    }

    // Ramp lifecycle. The ephemeral EVM address is echoed back from the registration request so
    // the returned transactions are owned by the keys the page just generated.
    if (path === "/v1/ramp/register" && method === "POST") {
      const body = request.postDataJSON() as {
        signingAccounts?: Array<{ address: string; type: string }>;
      } & Record<string, unknown>;
      registerRequests.push(body);
      const evmEphemeral = body.signingAccounts?.find(account => account.type === "EVM")?.address ?? POLYGON_USDT;
      unsignedTxs = buildSellUnsignedTxs(evmEphemeral);
      await fulfillJson(buildRampProcess({ unsignedTxs }));
      return;
    }
    if (path === "/v1/ramp/update" && method === "POST") {
      updateRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson(buildRampProcess({ unsignedTxs }));
      return;
    }
    if (path === "/v1/ramp/start" && method === "POST") {
      startRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson(buildRampProcess({ currentPhase: "squidRouterPay", status: "PENDING", unsignedTxs }));
      return;
    }
    // Checked before the /v1/ramp/:id status route below, which would otherwise swallow it.
    if (path.startsWith("/v1/ramp/history/") && method === "GET") {
      await fulfillJson({ totalCount: 0, transactions: [] });
      return;
    }
    if (path === `/v1/ramp/${E2E_RAMP_ID}` && method === "GET") {
      status.polls++;
      const complete = status.polls > (options.pendingStatusPolls ?? 1);
      await fulfillJson(
        buildRampProcess({
          currentPhase: complete ? "complete" : "squidRouterPay",
          feeCurrency: "MXN",
          networkFeeFiat: "2.00",
          processingFeeFiat: "8.00",
          status: complete ? "COMPLETE" : "PENDING",
          totalFeeFiat: "10.00",
          unsignedTxs
        })
      );
      return;
    }

    unmatchedRequests.push(`${method} ${path}`);
    await route.fulfill({ json: {}, status: 404 });
  });

  for (const { chainIdHex, pattern } of RPC_ENDPOINTS) {
    const answer = answerRpc(chainIdHex);
    await page.route(pattern, async route => {
      const body = route.request().postDataJSON() as Parameters<typeof answer>[0];
      await route.fulfill({ json: answer(body) });
    });
  }

  for (const pattern of THIRD_PARTY_BLOCKLIST) {
    await page.route(pattern, route => route.abort());
  }

  return {
    archiveInvitationRequests,
    auth,
    avenia,
    brlaCreateSubaccountRequests,
    fiatAccountRequests,
    kybFileTypes,
    kybFormSubmissions,
    kybRelatedPersonFileTypes,
    kybUploads,
    kyc,
    kycFormSubmissions,
    monerium,
    quoteRequests,
    registerRequests,
    requestOtpRequests,
    startRequests,
    status,
    unexpectedExternalRequests,
    unmatchedRequests,
    updateRequests,
    verifyOtpRequests
  };
}
