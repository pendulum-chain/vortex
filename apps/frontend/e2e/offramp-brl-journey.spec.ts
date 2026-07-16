import { expect, test } from "@playwright/test";
import { buildQuoteResponse, buildRampProcess, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

// Structurally valid CPF (passes the checksum in isValidCpf).
const VALID_CPF = "529.982.247-25";
const PIX_KEY = "e2e-pix-key@vortexfinance.co";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MOCK_WALLET_TX_HASH = `0x${"cd".repeat(32)}`;

// Critical journey 5: a full SELL (offramp) BRL ramp against the mocked backend — the
// money-OUT path, where the user's connected wallet (not an ephemeral) signs and
// broadcasts the source-of-funds transaction.
//
// quote -> Sell (wallet gate passed by the injected mock wallet; the Sell balance check
// reads the mocked Base RPC) -> email/OTP auth -> Avenia offramp eligibility (CPF + Pix
// key) -> KYC gate (existing CONFIRMED user) -> payment summary -> ramp registration ->
// ephemeral presigning posted to /ramp/update -> USER WALLET broadcast of the
// squidRouterNoPermitTransfer (eth_sendTransaction on the mock wallet) with its hash
// reported in a second /ramp/update -> automatic /ramp/start -> progress -> success.

const SELL_RAMP_FIELDS = {
  depositQrCode: undefined,
  from: "base",
  inputAmount: "100",
  inputCurrency: "USDC",
  outputAmount: "500",
  outputCurrency: "BRL",
  to: "pix",
  type: "SELL"
};

// The ephemeral's Base-side transactions plus the user-wallet source-of-funds transfer,
// mirroring the API's evm-to-brl-base offramp preparation for the Base+USDC direct path.
function buildSellUnsignedTxs(evmEphemeral: string) {
  const evmTx = (signer: string, nonce: number, phase: string) => ({
    meta: {},
    network: "base",
    nonce,
    phase,
    signer,
    txData: {
      data: `0xa9059cbb${"00".repeat(12)}${evmEphemeral.slice(2).toLowerCase()}${"00".repeat(30)}04c4`,
      gas: "150000",
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "1000000000",
      nonce,
      to: BASE_USDC,
      value: "0"
    }
  });
  return [
    evmTx(MOCK_WALLET_ADDRESS, 0, "squidRouterNoPermitTransfer"),
    evmTx(evmEphemeral, 0, "distributeFees"),
    evmTx(evmEphemeral, 1, "nablaApprove"),
    evmTx(evmEphemeral, 2, "nablaSwap"),
    evmTx(evmEphemeral, 3, "brlaPayoutOnBase"),
    evmTx(evmEphemeral, 4, "baseCleanupUsdc"),
    evmTx(evmEphemeral, 5, "baseCleanupBrla")
  ];
}

test("SELL BRL journey: quote, auth, CPF+Pix eligibility, registration, wallet signing, progress, success", async ({
  page
}) => {
  // The real API keeps returning the ramp's unsignedTxs on /ramp/update; the signing
  // step reads the user-wallet transactions from that response.
  let unsignedTxs: unknown[] = [];
  const backend = await mockBackend(page, {
    quotes: body =>
      ({
        body: buildQuoteResponse({
          ...SELL_RAMP_FIELDS,
          feeCurrency: "BRL",
          inputAmount: body.inputAmount,
          rampType: "SELL"
        }),
        status: 200
      }) as { status: number; body: unknown },
    rampStatusOverrides: () => SELL_RAMP_FIELDS,
    register: body => {
      const signingAccounts = (body.signingAccounts ?? []) as Array<{ address: string; type: string }>;
      const evmEphemeral = signingAccounts.find(account => account.type === "EVM")?.address ?? BASE_USDC;
      unsignedTxs = buildSellUnsignedTxs(evmEphemeral);
      return buildRampProcess({ ...SELL_RAMP_FIELDS, unsignedTxs });
    },
    update: () => buildRampProcess({ ...SELL_RAMP_FIELDS, unsignedTxs })
  });
  await injectMockWallet(page);

  await page.goto("/widget?rampType=SELL&fiat=BRL&inputAmount=100");

  // Stage 1: the quote form fetched a SELL quote; the wallet gate is already passed by
  // the injected mock wallet, and the balance check (mocked Base RPC) enables Sell.
  await expect(page.locator('input[name="outputAmount"]')).toHaveValue(/500/, { timeout: 20_000 });
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

  // Stage 4: Avenia OFFRAMP eligibility details — CPF and Pix key (no wallet field:
  // the destination is a Brazilian bank account). The offramp confirm button is
  // labelled "Verify Wallet" in this state.
  await expect(page.locator("#taxId")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#pixId")).toBeVisible();
  await page.locator("#taxId").fill(VALID_CPF);
  await page.locator("#pixId").fill(PIX_KEY);
  await page.getByRole("button", { name: "Verify Wallet" }).click();

  // Stage 5: KYC gate happy path (existing CONFIRMED user) lands on the payment summary.
  await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });
  expect(backend.brlaGetUserRequests).toContain(VALID_CPF);

  // Stage 6: confirming registers the ramp; the CPF and Pix key travel as additionalData.
  await page.getByRole("button", { name: "Confirm" }).click();

  // Stage 7: the ephemeral transactions are signed in-page and posted to /ramp/update,
  // then the USER WALLET broadcasts the source-of-funds transfer and its hash is
  // reported in a second update; the offramp starts automatically and (once polling
  // reports COMPLETE) lands on the SELL success screen.
  await expect(page.getByRole("heading", { name: "All set! The withdrawal has been sent to your bank." })).toBeVisible({
    timeout: 45_000
  });
  await expect(page.getByText("Your funds were sent via PIX and are now in your bank account.")).toBeVisible();

  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as {
    quoteId: string;
    signingAccounts: Array<{ type: string }>;
    additionalData?: { pixDestination?: string; taxId?: string; walletAddress?: string };
  };
  expect(registerBody.quoteId).toBe("quote-e2e-1");
  expect(registerBody.signingAccounts.map(account => account.type).sort()).toEqual(["EVM", "Substrate"]);
  expect(registerBody.additionalData?.pixDestination).toBe(PIX_KEY);
  expect(registerBody.additionalData?.taxId).toBe(VALID_CPF);
  expect(registerBody.additionalData?.walletAddress?.toLowerCase()).toBe(MOCK_WALLET_ADDRESS.toLowerCase());

  // Update #1: the six ephemeral transactions, locally signed (raw EIP-1559 txs). The
  // user-wallet transfer must NOT be among them.
  expect(backend.updateRequests.length).toBeGreaterThanOrEqual(2);
  const ephemeralUpdate = backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> };
  expect(ephemeralUpdate.presignedTxs.map(tx => tx.phase)).not.toContain("squidRouterNoPermitTransfer");
  expect(ephemeralUpdate.presignedTxs).toHaveLength(6);
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
