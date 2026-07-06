import { expect, test } from "@playwright/test";
import { buildQuoteResponse, buildRampProcess, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const MOCK_WALLET_TX_HASH = `0x${"cd".repeat(32)}`;
const FIAT_ACCOUNT_ID = "fiat-account-e2e-1";

// Critical journey 7: a full SELL (offramp) USD ramp over the Alfredpay rail — the
// money-OUT counterpart to the BRL offramp. Unlike the Avenia path there is no CPF/Pix
// eligibility form: the payout destination is a fiat account registered with Alfredpay,
// selected on the payment summary, and its fiatAccountId travels in the registration's
// additionalData.
//
// quote (USDT on Polygon -> USD via bank transfer; the wallet gate is passed by the
// injected mock wallet on Polygon and the balance check reads the mocked Alchemy API) ->
// email/OTP auth -> wallet-ownership details step -> Alfredpay KYC gate (existing
// verified customer for country US) -> payment summary with the registered US bank
// account -> ramp registration -> ephemeral presigning posted to /ramp/update -> USER
// WALLET broadcast of the squidRouterNoPermitTransfer (eth_sendTransaction on the mock
// wallet) with its hash reported in a second /ramp/update -> automatic /ramp/start ->
// progress.
//
// KNOWN GAP: unlike the BRL offramp, this journey cannot end on the success screen. The
// progress page's getRampFlow (src/pages/progress/index.tsx) returns null for SELL
// ramps whose output is not BRL/EURC, so the ramp status is never polled after start
// and currentPhase never advances to "complete" — for Alfredpay offramps the UI stays
// on the progress screen. This spec asserts the truthful current behavior (progress
// after the automatic start); extend it to the success screen when that gap is fixed.

const SELL_RAMP_FIELDS = {
  depositQrCode: undefined,
  from: "polygon",
  inputAmount: "100",
  inputCurrency: "USDT",
  outputAmount: "99",
  outputCurrency: "USD",
  paymentMethod: "ach",
  to: "ach",
  type: "SELL"
};

// The registered payout account served by GET /v1/alfredpay/fiatAccounts (an
// AlfredpayFiatAccount; US accounts are stored as BANK_USA and displayed as "WIRE").
const US_BANK_ACCOUNT = {
  accountName: "Vortex E2E Checking",
  accountNumber: "000123456789",
  accountType: "CHECKING",
  createdAt: new Date().toISOString(),
  customerId: "alfred-customer-e2e-1",
  fiatAccountId: FIAT_ACCOUNT_ID,
  metadata: { accountHolderName: "Vortex E2E" },
  routingNumber: "026009593",
  type: "BANK_USA"
};

// Mirrors the API's evm-to-alfredpay offramp preparation for the direct
// Polygon-USDT no-permit path: the USER wallet signs a single
// squidRouterNoPermitTransfer to the EVM ephemeral, and the ephemeral signs the
// Alfredpay deposit transfer, its fallback (both nonce 0 — only one executes), and
// the axlUSDC cleanup approval.
function buildSellUnsignedTxs(evmEphemeral: string) {
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

test("SELL USD journey: quote, auth, Alfredpay KYC gate, fiat account, registration, wallet signing, progress", async ({
  page
}) => {
  // The real API keeps returning the ramp's unsignedTxs on /ramp/update; the signing
  // step reads the user-wallet transaction from that response.
  let unsignedTxs: unknown[] = [];
  const backend = await mockBackend(page, {
    fiatAccounts: () => [US_BANK_ACCOUNT],
    quotes: body =>
      ({
        body: buildQuoteResponse({
          ...SELL_RAMP_FIELDS,
          // Alfredpay quotes carry the resolved stablecoin input limits; the quote form
          // validates the USDT inputAmount against them (not the legacy fiat sell limits).
          alfredpayInputLimits: { max: "10000", min: "10" },
          feeCurrency: "USD",
          inputAmount: body.inputAmount,
          rampType: "SELL"
        }),
        status: 200
      }) as { status: number; body: unknown },
    register: body => {
      const signingAccounts = (body.signingAccounts ?? []) as Array<{ address: string; type: string }>;
      const evmEphemeral = signingAccounts.find(account => account.type === "EVM")?.address ?? POLYGON_USDT;
      unsignedTxs = buildSellUnsignedTxs(evmEphemeral);
      return buildRampProcess({ ...SELL_RAMP_FIELDS, unsignedTxs });
    },
    update: () => buildRampProcess({ ...SELL_RAMP_FIELDS, unsignedTxs })
  });
  // The whole journey lives on Polygon, so the mock wallet connects on chain 137.
  await injectMockWallet(page, { chainIdHex: "0x89" });
  // Preselect Polygon via the persisted network choice instead of the `network` URL
  // param: passing network+cryptoLocked in the URL makes the widget create the quote
  // itself and skip the quote form, and stage 1 (form + wallet gate + balance check)
  // is part of this journey.
  await page.addInitScript(() => localStorage.setItem("SELECTED_NETWORK", "polygon"));

  await page.goto("/widget?rampType=SELL&fiat=USD&cryptoLocked=USDT&inputAmount=100");

  // Stage 1: the quote form fetched a SELL USDT->USD quote; the wallet gate is already
  // passed by the injected mock wallet, and the balance check (mocked Alchemy data API,
  // which holds USDT on Polygon) enables Sell.
  await expect(page.locator('input[name="outputAmount"]')).toHaveValue(/99/, { timeout: 20_000 });
  const sellButton = page.locator("form").getByRole("button", { name: "Sell" });
  await expect(sellButton).toBeEnabled({ timeout: 20_000 });
  await sellButton.click();

  // Stage 2 + 3: email/OTP auth gate.
  await expect(page.getByRole("heading", { name: "Verify Your Email" })).toBeVisible({ timeout: 20_000 });
  await page.locator("#email").fill("e2e@vortexfinance.co");
  await page.locator("#terms").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter Verification Code" })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially("123456");

  // Stage 4: Alfredpay offramp details — only wallet ownership, no CPF/Pix fields (the
  // payout destination is the Alfredpay fiat account picked later on the summary).
  await expect(page.getByText("Verify you are the owner of the wallet")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#taxId")).toHaveCount(0);
  await expect(page.locator("#pixId")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /0xf39F/ })).toBeVisible();
  await page.getByRole("button", { name: "Verify Wallet" }).click();

  // Stage 5: the Alfredpay KYC gate queried the customer status for US and, since the
  // customer is verified (SUCCESS), the flow lands on the payment summary, where the
  // registered US bank account is listed and preselected as the payout method.
  await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(US_BANK_ACCOUNT.accountName)).toBeVisible({ timeout: 20_000 });
  expect(backend.fiatAccountsRequests).toContain("US");

  // Stage 6: confirming registers the ramp; the fiat account travels as additionalData.
  await page.getByRole("button", { name: "Confirm" }).click();

  // Stage 7: the ephemeral transactions are signed in-page and posted to /ramp/update,
  // then the USER WALLET broadcasts the source-of-funds transfer and its hash is
  // reported in a second update; the offramp starts automatically and lands on the
  // progress screen (which only renders once the machine reaches RampFollowUp, i.e.
  // after /ramp/start succeeded). See the KNOWN GAP note above for why the journey
  // ends here instead of on the success screen.
  await expect(page.getByRole("heading", { name: "Your transaction is in progress." })).toBeVisible({
    timeout: 45_000
  });

  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as {
    quoteId: string;
    signingAccounts: Array<{ type: string }>;
    additionalData?: { fiatAccountId?: string; pixDestination?: string; taxId?: string; walletAddress?: string };
  };
  expect(registerBody.quoteId).toBe("quote-e2e-1");
  expect(registerBody.signingAccounts.map(account => account.type).sort()).toEqual(["EVM", "Substrate"]);
  expect(registerBody.additionalData?.fiatAccountId).toBe(FIAT_ACCOUNT_ID);
  expect(registerBody.additionalData?.walletAddress?.toLowerCase()).toBe(MOCK_WALLET_ADDRESS.toLowerCase());
  // The Avenia-only fields never travel on the Alfredpay rail.
  expect(registerBody.additionalData?.pixDestination).toBeUndefined();
  expect(registerBody.additionalData?.taxId).toBeUndefined();

  // Update #1: the three ephemeral transactions, locally signed (raw EIP-1559 txs). The
  // user-wallet transfer must NOT be among them.
  expect(backend.updateRequests.length).toBeGreaterThanOrEqual(2);
  const ephemeralUpdate = backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> };
  expect(ephemeralUpdate.presignedTxs.map(tx => tx.phase)).not.toContain("squidRouterNoPermitTransfer");
  expect(ephemeralUpdate.presignedTxs.map(tx => tx.phase).sort()).toEqual([
    "alfredpayOfframpTransfer",
    "alfredpayOfframpTransferFallback",
    "polygonCleanupAxlUsdc"
  ]);
  for (const tx of ephemeralUpdate.presignedTxs) {
    expect(typeof tx.txData).toBe("string");
    expect(tx.txData as string).toMatch(/^0x02/);
  }

  // Update #2: the hash of the wallet-broadcast transfer, reported as additionalData.
  const signingUpdate = backend.updateRequests[1] as { additionalData?: Record<string, unknown> };
  expect(signingUpdate.additionalData?.squidRouterNoPermitTransferHash).toBe(MOCK_WALLET_TX_HASH);

  // The offramp started without a manual payment-confirmation step.
  expect(backend.startRequests).toHaveLength(1);
  expect(backend.startRequests[0]).toMatchObject({ rampId: E2E_RAMP_ID });
});
