import { expect, test } from "@playwright/test";
import { E2E_DEPOSIT_QR_CODE, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

// Structurally valid CPF (passes the checksum in isValidCpf).
const VALID_CPF = "529.982.247-25";

// Critical journey 4: a full BUY (onramp) BRL ramp against the mocked backend.
//
// quote -> Buy -> email/OTP auth -> Avenia eligibility details (CPF + wallet) -> KYC gate
// (existing CONFIRMED user, so no full Avenia KYC flow) -> payment summary -> ramp
// registration -> local ephemeral-key signing + /ramp/update -> Pix deposit QR -> "I have
// made the payment" -> /ramp/start -> progress page -> success page once polling reports
// COMPLETE.
//
// Notes on coverage limits:
// - A BRL onramp has no user wallet signature step: every unsigned transaction returned by
//   /ramp/register is signed in-page with the throwaway ephemeral keys (viem/polkadot, fully
//   local; only eth_chainId RPCs leave the page and are answered by mockBackend). We assert
//   that signing happened via the presignedTxs posted to /ramp/update. The injected mock
//   wallet still drives the connected-account state and would answer eth_sendTransaction /
//   eth_signTypedData_v4 if a journey required it (offramps do).
// - The full Avenia KYC flow (document upload + selfie liveness) is not exercised: the
//   liveness check opens an external Avenia-hosted URL in a separate window, which cannot be
//   completed hermetically. The mocked /brla/getUser instead reports an existing
//   KYC-confirmed user, which is the KYC gate's happy path.
test("BUY BRL journey: quote, auth, KYC gate, registration, signing, Pix QR, progress, success", async ({ page }) => {
  const backend = await mockBackend(page);
  await injectMockWallet(page);

  await page.goto("/widget?rampType=BUY&fiat=BRL&inputAmount=100");

  // Stage 1: the quote form fetched a quote; Buy becomes actionable.
  await expect(page.locator('input[name="outputAmount"]')).toHaveValue(/25\.5/, { timeout: 20_000 });
  await page.locator("form").getByRole("button", { name: "Buy" }).click();

  // Stage 2: auth gate - email step.
  await expect(page.getByRole("heading", { name: "Verify Your Email" })).toBeVisible({ timeout: 20_000 });
  await page.locator("#email").fill("e2e@vortexfinance.co");
  await page.locator("#terms").check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Stage 3: auth gate - OTP step; entering the 6th digit submits automatically.
  await expect(page.getByRole("heading", { name: "Enter Verification Code" })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially("123456");

  // Stage 4: Avenia eligibility details (CPF + wallet address). The wallet field is
  // auto-filled from the injected mock wallet once wagmi reconnects to it.
  await expect(page.locator("#taxId")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#walletAddress")).toHaveValue(MOCK_WALLET_ADDRESS, { timeout: 20_000 });
  await page.locator("#taxId").fill(VALID_CPF);
  await page.locator("form").getByRole("button", { name: "Continue" }).click();

  // Stage 5: the KYC gate queried the backend for the CPF and, since the user is
  // CONFIRMED, the flow lands on the payment summary.
  await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });
  expect(backend.brlaGetUserRequests).toContain(VALID_CPF);

  // Stage 6: confirming registers the ramp, signs the returned transactions with the
  // ephemeral keys, updates the ramp, and surfaces the Pix payment instructions.
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Pay with Pix")).toBeVisible({ timeout: 30_000 });

  // The registration carried the quote and both ephemeral signing accounts...
  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as {
    quoteId: string;
    signingAccounts: Array<{ type: string }>;
    additionalData?: { destinationAddress?: string; taxId?: string };
  };
  expect(registerBody.quoteId).toBe("quote-e2e-1");
  expect(registerBody.signingAccounts.map(account => account.type).sort()).toEqual(["EVM", "Substrate"]);

  // ...and every unsigned transaction came back locally signed (serialized raw txs) in /ramp/update.
  expect(backend.updateRequests).toHaveLength(1);
  const presignedTxs = (backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> }).presignedTxs;
  expect(presignedTxs.length).toBe(6);
  for (const tx of presignedTxs) {
    expect(typeof tx.txData).toBe("string");
    expect(tx.txData as string).toMatch(/^0x02/); // EIP-1559 raw transaction
  }

  // The Pix BR code is shown as copyable text alongside the QR, and the submit slot now
  // asks for payment confirmation.
  await expect(page.getByText(E2E_DEPOSIT_QR_CODE)).toBeVisible();
  const paymentButton = page.getByRole("button", { name: "I have made the payment" });
  await expect(paymentButton).toBeEnabled();

  // Stage 7: confirming the payment starts the ramp and shows the progress screen.
  await paymentButton.click();
  await expect(page.getByText("Your payment is being processed. This can take up to 5 minutes.")).toBeVisible({
    timeout: 20_000
  });
  expect(backend.startRequests).toHaveLength(1);
  expect(backend.startRequests[0]).toMatchObject({ rampId: E2E_RAMP_ID });

  // Stage 8: once status polling reports COMPLETE, the success screen appears.
  await expect(page.getByRole("heading", { name: "All set! Your tokens are on their way." })).toBeVisible({
    timeout: 30_000
  });
});
