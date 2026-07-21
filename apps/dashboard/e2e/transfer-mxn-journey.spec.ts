import { expect, test } from "@playwright/test";
import { E2E_FIAT_ACCOUNT_ID, E2E_FIAT_ACCOUNT_ID_2, E2E_QUOTE_ID, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS, MOCK_WALLET_TX_HASH } from "./support/mockWallet";
import { seedSession } from "./support/session";

const PAYOUT_MXN = "1000";
// The quote endpoint is input-driven, so the form inverts the payout at USDC_RATES.MX (18.5)
// and quotes for that many USDC: (1000 / 18.5).toFixed(6).
const EXPECTED_PAYIN_USDC = "54.054054";

// The dashboard's money path: a SELL (offramp) transfer of USDC on Polygon to an MXN payout
// account, against the mocked backend and the injected mock wallet.
//
// quote -> register (fresh ephemeral keypairs) -> the ephemeral-owned transactions are signed
// in-page and posted to /ramp/update -> the user-owned transaction is broadcast by the connected
// wallet and its hash reported in a second update -> /ramp/start -> status polling reaches
// COMPLETE while the form navigates to /transactions.
//
// Coverage limits:
// - No chain is touched. Ephemeral signing is real (viem serializes an EIP-1559 transaction
//   offline), which is what the raw-0x02 assertions below pin down. The user transaction is
//   "broadcast" by the wallet stub, and its receipt is answered by the mocked Polygon RPC.
// - Only the direct Polygon no-permit path is exercised; the permit/TokenRelayer variant needs
//   relayer-contract execution that the mock does not model.
test("SELL MXN transfer: quote, register, ephemeral presigning, wallet broadcast, start, tracking", async ({ page }) => {
  const backend = await mockBackend(page);
  // The whole journey lives on Polygon, so the wallet connects on chain 137 and
  // signAndSubmitEvmTransaction never needs a chain switch.
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);

  await page.goto("/transfer");

  // Stage 1: the only approved corridor is MX, and its single saved payout account becomes an
  // approved self-recipient that the form auto-selects — so the amount field is already live.
  const amountInput = page.locator("#payout-amount");
  await expect(amountInput).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SPEI · Vortex E2E CLABE · ••••0004")).toBeVisible();
  await amountInput.fill(PAYOUT_MXN);

  // Stage 2: a quote arrives and the funding panel shows the auto-connected wallet, so the
  // submit button carries the payin amount.
  const sendButton = page.getByRole("button", { name: /Send/ });
  await expect(sendButton).toBeEnabled({ timeout: 20_000 });
  await expect(sendButton).toContainText(EXPECTED_PAYIN_USDC);
  await expect(page.getByText("1 USDC = 18.69 MXN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fee details" }).click();
  await expect(page.getByText("1 USDC = 18.50 MXN", { exact: true })).toBeVisible();

  // Stage 3: submitting runs register -> presign -> user signing -> start. The form toasts and
  // navigates once the machine reaches Tracking.
  await sendButton.click();
  await expect.poll(() => backend.updateRequests.length, { timeout: 20_000 }).toBe(2);
  await expect(page.getByText("Transfer initiated")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/transactions/);

  // The quote was requested once, for the inverted payin amount on the SELL rail.
  expect(backend.quoteRequests).toHaveLength(1);
  expect(backend.quoteRequests[0]).toMatchObject({
    countryCode: "MX",
    inputAmount: EXPECTED_PAYIN_USDC,
    inputCurrency: "USDC",
    network: "polygon",
    outputCurrency: "MXN",
    paymentMethod: "spei",
    rampType: "SELL"
  });

  // Registration carried the quote, both ephemeral signing accounts, and the payout target the
  // backend cannot derive (the saved Alfredpay fiat account).
  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as {
    quoteId: string;
    signingAccounts: Array<{ type: string }>;
    additionalData?: { fiatAccountId?: string; walletAddress?: string; pixDestination?: string };
  };
  expect(registerBody.quoteId).toBe(E2E_QUOTE_ID);
  expect(registerBody.signingAccounts.map(account => account.type).sort()).toEqual(["EVM", "Substrate"]);
  expect(registerBody.additionalData?.fiatAccountId).toBe(E2E_FIAT_ACCOUNT_ID);
  expect(registerBody.additionalData?.walletAddress?.toLowerCase()).toBe(MOCK_WALLET_ADDRESS.toLowerCase());
  // The Avenia-only field never travels on the Alfredpay rail.
  expect(registerBody.additionalData?.pixDestination).toBeUndefined();

  // Update #1: the three ephemeral transactions came back locally signed as raw EIP-1559
  // transactions. The user-owned transfer must NOT be among them.
  expect(backend.updateRequests).toHaveLength(2);
  const ephemeralUpdate = backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> };
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

  // The offramp starts without a manual payment-confirmation step, then polls to a terminal phase.
  expect(backend.startRequests).toHaveLength(1);
  expect(backend.startRequests[0]).toMatchObject({ rampId: E2E_RAMP_ID });
  await expect.poll(() => backend.status.polls, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);

  // Nothing escaped to a real server or a real chain.
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

// Each saved payout account is its own self-recipient, and the offramp registers against the
// selected one's fiatAccountId. Picking the second account must send the money there — the first
// account is auto-selected, so a broken selector would silently pay out to the wrong account.
test("SELL MXN transfer: choosing a different payout account registers against that account", async ({ page }) => {
  const backend = await mockBackend(page);
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);

  await page.goto("/transfer");

  // The first account is selected on load; the payin-network select is the other combobox.
  const recipientSelect = page.getByRole("combobox").filter({ hasText: "Vortex E2E CLABE" });
  await expect(recipientSelect).toBeVisible({ timeout: 20_000 });

  const amountInput = page.locator("#payout-amount");
  await amountInput.fill(PAYOUT_MXN);

  await recipientSelect.click();
  await page.getByRole("option", { name: /Vortex E2E Savings/ }).click();

  // Switching recipients clears the amount (recipients no longer carry a default amount),
  // so it has to be entered again before a quote is requested.
  await expect(page.getByText("SPEI · Vortex E2E Savings · ••••0099")).toBeVisible();
  await expect(amountInput).toHaveValue("");
  await amountInput.fill(PAYOUT_MXN);

  const sendButton = page.getByRole("button", { name: /Send/ });
  await expect(sendButton).toBeEnabled({ timeout: 20_000 });
  await sendButton.click();

  await expect.poll(() => backend.updateRequests.length, { timeout: 20_000 }).toBe(2);
  await expect(page.getByText("Transfer initiated")).toBeVisible({ timeout: 30_000 });

  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as { additionalData?: { fiatAccountId?: string } };
  expect(registerBody.additionalData?.fiatAccountId).toBe(E2E_FIAT_ACCOUNT_ID_2);
  expect(registerBody.additionalData?.fiatAccountId).not.toBe(E2E_FIAT_ACCOUNT_ID);
});
