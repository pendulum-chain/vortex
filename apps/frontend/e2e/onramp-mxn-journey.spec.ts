import { expect, test } from "@playwright/test";
import { buildQuoteResponse, buildRampProcess, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const E2E_CLABE = "646180157000000004";

// Critical journey 6: a full BUY (onramp) MXN ramp over the Alfredpay rail — the corridor
// family (MXN/USD/COP/ARS) the BRL journey never touches. The Alfredpay KYC gate is
// exercised on its happy path (an existing verified customer, alfredpayStatus=SUCCESS),
// and the payment step shows SPEI bank transfer details (CLABE) instead of a Pix QR.
//
// quote -> Buy -> email/OTP auth -> destination wallet details -> Alfredpay KYC gate ->
// summary -> registration (destinationAddress + walletAddress) -> in-page ephemeral
// signing on POLYGON posted to /ramp/update -> SPEI payment details (CLABE) -> "I have
// made the payment" -> /ramp/start -> progress -> success.

const MXN_RAMP_FIELDS = {
  depositQrCode: undefined,
  from: "spei",
  inputAmount: "2000",
  inputCurrency: "MXN",
  outputAmount: "100",
  outputCurrency: "USDT",
  to: "polygon",
  type: "BUY"
};

const ACH_PAYMENT_DATA = {
  accountHolderName: "Vortex E2E",
  bankName: "STP",
  clabe: E2E_CLABE,
  reference: "VORTEX-E2E-REF"
};

// The Alfredpay onramp's Polygon-side transactions signed by the EVM ephemeral
// (destinationTransfer + cleanup), mirroring alfredpay-to-evm.ts' direct-token path.
function buildMxnUnsignedTxs(evmEphemeral: string) {
  const evmTx = (nonce: number, phase: string) => ({
    meta: {},
    network: "polygon",
    nonce,
    phase,
    signer: evmEphemeral,
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
  return [evmTx(0, "destinationTransfer"), evmTx(1, "polygonCleanup")];
}

test("BUY MXN journey: quote, auth, Alfredpay KYC gate, registration, signing, SPEI details, progress, success", async ({
  page
}) => {
  let unsignedTxs: unknown[] = [];
  const backend = await mockBackend(page, {
    quotes: body =>
      ({
        body: buildQuoteResponse({
          ...MXN_RAMP_FIELDS,
          feeCurrency: "MXN",
          inputAmount: body.inputAmount,
          rampType: "BUY"
        }),
        status: 200
      }) as { status: number; body: unknown },
    rampStatusOverrides: () => MXN_RAMP_FIELDS,
    register: body => {
      const signingAccounts = (body.signingAccounts ?? []) as Array<{ address: string; type: string }>;
      const evmEphemeral = signingAccounts.find(account => account.type === "EVM")?.address ?? POLYGON_USDT;
      unsignedTxs = buildMxnUnsignedTxs(evmEphemeral);
      return buildRampProcess({ ...MXN_RAMP_FIELDS, unsignedTxs });
    },
    update: () => buildRampProcess({ ...MXN_RAMP_FIELDS, achPaymentData: ACH_PAYMENT_DATA, unsignedTxs })
  });
  await injectMockWallet(page);

  await page.goto("/widget?rampType=BUY&fiat=MXN&inputAmount=2000");

  // Stage 1: the quote form fetched a BUY MXN quote.
  await expect(page.locator('input[name="outputAmount"]')).toHaveValue(/100/, { timeout: 20_000 });
  await page.locator("form").getByRole("button", { name: "Buy" }).click();

  // Stage 2 + 3: email/OTP auth gate.
  await expect(page.getByRole("heading", { name: "Verify Your Email" })).toBeVisible({ timeout: 20_000 });
  await page.locator("#email").fill("e2e@vortexfinance.co");
  await page.locator("#terms").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter Verification Code" })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially("123456");

  // Stage 4: wallet ownership step — the connected mock wallet is shown; confirming
  // sends CONFIRM with the wallet as the destination.
  await expect(page.getByText("Verify you are the owner of the wallet")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /0xf39F/ })).toBeVisible();
  await page.getByRole("button", { name: "Verify Wallet" }).click();

  // Stage 5: the Alfredpay KYC gate queried the customer status for MX and, since the
  // customer is verified (SUCCESS), the flow lands on the payment summary.
  await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });

  // Stage 6: confirming registers the ramp and signs the Polygon transactions in-page;
  // the SPEI payment details from the update response are then displayed.
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(E2E_CLABE).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(ACH_PAYMENT_DATA.reference)).toBeVisible();

  expect(backend.registerRequests).toHaveLength(1);
  const registerBody = backend.registerRequests[0] as {
    quoteId: string;
    signingAccounts: Array<{ type: string }>;
    additionalData?: { destinationAddress?: string; walletAddress?: string };
  };
  expect(registerBody.quoteId).toBe("quote-e2e-1");
  expect(registerBody.additionalData?.destinationAddress?.toLowerCase()).toBe(MOCK_WALLET_ADDRESS.toLowerCase());
  expect(registerBody.additionalData?.walletAddress?.toLowerCase()).toBe(MOCK_WALLET_ADDRESS.toLowerCase());

  // Every unsigned Polygon transaction came back locally signed (raw EIP-1559 txs).
  expect(backend.updateRequests.length).toBeGreaterThanOrEqual(1);
  const presignedTxs = (backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> }).presignedTxs;
  expect(presignedTxs.map(tx => tx.phase).sort()).toEqual(["destinationTransfer", "polygonCleanup"]);
  for (const tx of presignedTxs) {
    expect(typeof tx.txData).toBe("string");
    expect(tx.txData as string).toMatch(/^0x02/);
  }

  // Stage 7: confirming the payment starts the ramp; once polling reports COMPLETE the
  // BUY success screen appears.
  await page.getByRole("button", { name: "I have made the payment" }).click();
  await expect(page.getByRole("heading", { name: "All set! Your tokens are on their way." })).toBeVisible({ timeout: 45_000 });
  expect(backend.startRequests).toHaveLength(1);
  expect(backend.startRequests[0]).toMatchObject({ rampId: E2E_RAMP_ID });
});
