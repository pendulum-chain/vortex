import { expect, test } from "@playwright/test";
import { buildQuoteResponse, buildRampProcess, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const MOCK_WALLET_TX_HASH = `0x${"cd".repeat(32)}`;

// Critical journey 7: full SELL (offramp) journeys over the Alfredpay rail — the
// money-OUT counterpart to the BRL offramp. Unlike the Avenia path there is no CPF/Pix
// eligibility form: the payout destination is a fiat account registered with Alfredpay,
// selected on the payment summary, and its fiatAccountId travels in the registration's
// additionalData. The UI flow is identical for all four currencies (quote with USDT on
// Polygon -> email/OTP auth -> wallet-ownership details step -> Alfredpay KYC gate with
// an existing verified customer -> payment summary with the registered payout account ->
// ramp registration -> ephemeral presigning posted to /ramp/update -> USER WALLET
// broadcast of the squidRouterNoPermitTransfer with its hash reported in a second
// /ramp/update -> automatic /ramp/start -> progress -> success once polling reports
// COMPLETE), so the journey is parameterized per currency. What differs — and what each
// case pins down — is the KYC-gate country, the corridor's payout destination, and the
// registered fiat-account type (constants/fiatAccountMethods.ts):
//   USD -> BANK_USA bank account (displayed as "WIRE")
//   MXN -> SPEI account holding an 18-digit CLABE
//   COP -> ACH account (Colombian accounts display as "ACH_COL", carry document metadata)
//   ARS -> COELSA account holding a 22-digit CBU

interface SellJourneyCase {
  fiat: "USD" | "MXN" | "COP" | "ARS";
  /** Country the Alfredpay KYC gate and fiat-account listing must be queried for. */
  country: string;
  /** The corridor's payout destination (mapFiatToDestination in shared). */
  to: string;
  outputAmount: string;
  /** The registered payout account served by GET /v1/alfredpay/fiatAccounts (AlfredpayFiatAccount). */
  fiatAccount: Record<string, unknown> & { accountName: string; fiatAccountId: string };
  /** The success page's per-token arrival text (pages.success.arrivalText.sell in en.json). */
  arrivalText: string;
}

function buildFiatAccount<T extends Record<string, unknown>>(fields: T) {
  return {
    createdAt: new Date().toISOString(),
    customerId: "alfred-customer-e2e-1",
    ...fields
  };
}

const CASES: SellJourneyCase[] = [
  {
    arrivalText: "Your funds will arrive in your bank account in a few minutes.",
    country: "US",
    fiat: "USD",
    // US accounts are stored as BANK_USA and displayed as "WIRE".
    fiatAccount: buildFiatAccount({
      accountName: "Vortex E2E Checking",
      accountNumber: "000123456789",
      accountType: "CHECKING",
      fiatAccountId: "fiat-account-e2e-us",
      metadata: { accountHolderName: "Vortex E2E" },
      routingNumber: "026009593",
      type: "BANK_USA"
    }) as SellJourneyCase["fiatAccount"],
    outputAmount: "99",
    to: "ach"
  },
  {
    arrivalText: "Your funds will arrive in your bank account via SPEI in a few minutes.",
    country: "MX",
    fiat: "MXN",
    // Mexican accounts are SPEI accounts holding an 18-digit CLABE.
    fiatAccount: buildFiatAccount({
      accountName: "Vortex E2E CLABE",
      accountNumber: "646180157000000004",
      accountType: "CLABE",
      fiatAccountId: "fiat-account-e2e-mx",
      metadata: { accountHolderName: "Vortex E2E" },
      type: "SPEI"
    }) as SellJourneyCase["fiatAccount"],
    outputAmount: "1900",
    to: "spei"
  },
  {
    arrivalText: "Your funds will arrive in your bank account in a few minutes.",
    country: "CO",
    fiat: "COP",
    // Colombian accounts are stored as ACH (displayed as "ACH_COL") and carry the
    // holder's document metadata from the ACH_COL registration form.
    fiatAccount: buildFiatAccount({
      accountName: "Vortex E2E Ahorros",
      accountNumber: "123456789012",
      accountType: "AHORRO",
      fiatAccountId: "fiat-account-e2e-co",
      metadata: { accountHolderName: "Vortex E2E", documentNumber: "1234567890", documentType: "CC" },
      type: "ACH"
    }) as SellJourneyCase["fiatAccount"],
    outputAmount: "400000",
    to: "ach"
  },
  {
    arrivalText: "Your funds will arrive in your bank account in a few minutes.",
    country: "AR",
    fiat: "ARS",
    // Argentine accounts are COELSA accounts holding a 22-digit CBU/CVU.
    fiatAccount: buildFiatAccount({
      accountName: "Vortex E2E CBU",
      accountNumber: "2850590940090418135201",
      accountType: "CBU",
      fiatAccountId: "fiat-account-e2e-ar",
      metadata: { accountHolderName: "Vortex E2E" },
      type: "COELSA"
    }) as SellJourneyCase["fiatAccount"],
    outputAmount: "130000",
    to: "cbu"
  }
];

// The quote form displays amounts with locale grouping ("1900" renders as "1,900.00").
const displayedAmount = (amount: string) => new RegExp(Number(amount).toLocaleString("en-US"));

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

for (const journey of CASES) {
  test(`SELL ${journey.fiat} journey: quote, auth, Alfredpay KYC gate, fiat account, registration, wallet signing, progress, success`, async ({
    page
  }) => {
    const rampFields = {
      depositQrCode: undefined,
      from: "polygon",
      inputAmount: "100",
      inputCurrency: "USDT",
      outputAmount: journey.outputAmount,
      outputCurrency: journey.fiat,
      paymentMethod: journey.to,
      to: journey.to,
      type: "SELL"
    };

    // The real API keeps returning the ramp's unsignedTxs on /ramp/update; the signing
    // step reads the user-wallet transaction from that response.
    let unsignedTxs: unknown[] = [];
    const backend = await mockBackend(page, {
      fiatAccounts: () => [journey.fiatAccount],
      quotes: body =>
        ({
          body: buildQuoteResponse({
            ...rampFields,
            // Alfredpay quotes carry the resolved stablecoin input limits; the quote form
            // validates the USDT inputAmount against them (not the legacy fiat sell limits).
            alfredpayInputLimits: { max: "10000", min: "10" },
            feeCurrency: journey.fiat,
            inputAmount: body.inputAmount,
            rampType: "SELL"
          }),
          status: 200
        }) as { status: number; body: unknown },
      rampStatusOverrides: () => rampFields,
      register: body => {
        const signingAccounts = (body.signingAccounts ?? []) as Array<{ address: string; type: string }>;
        const evmEphemeral = signingAccounts.find(account => account.type === "EVM")?.address ?? POLYGON_USDT;
        unsignedTxs = buildSellUnsignedTxs(evmEphemeral);
        return buildRampProcess({ ...rampFields, unsignedTxs });
      },
      update: () => buildRampProcess({ ...rampFields, unsignedTxs })
    });
    // The whole journey lives on Polygon, so the mock wallet connects on chain 137.
    await injectMockWallet(page, { chainIdHex: "0x89" });
    // Preselect Polygon via the persisted network choice instead of the `network` URL
    // param: passing network+cryptoLocked in the URL makes the widget create the quote
    // itself and skip the quote form, and stage 1 (form + wallet gate + balance check)
    // is part of this journey.
    await page.addInitScript(() => localStorage.setItem("SELECTED_NETWORK", "polygon"));

    await page.goto(`/widget?rampType=SELL&fiat=${journey.fiat}&cryptoLocked=USDT&inputAmount=100`);

    // Stage 1: the quote form fetched a SELL USDT->fiat quote; the wallet gate is already
    // passed by the injected mock wallet, and the balance check (mocked Alchemy data API,
    // which holds USDT on Polygon) enables Sell.
    await expect(page.locator('input[name="outputAmount"]')).toHaveValue(displayedAmount(journey.outputAmount), {
      timeout: 20_000
    });
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

    // Stage 5: the Alfredpay KYC gate queried the customer status for the case's country
    // and, since the customer is verified (SUCCESS), the flow lands on the payment
    // summary, where the registered payout account is listed and preselected.
    await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(journey.fiatAccount.accountName)).toBeVisible({ timeout: 20_000 });
    expect(backend.alfredpayStatusRequests).toContain(journey.country);
    expect(backend.fiatAccountsRequests).toContain(journey.country);

    // Stage 6: confirming registers the ramp; the fiat account travels as additionalData.
    await page.getByRole("button", { name: "Confirm" }).click();

    // Stage 7: the ephemeral transactions are signed in-page and posted to /ramp/update,
    // then the USER WALLET broadcasts the source-of-funds transfer and its hash is
    // reported in a second update; the offramp starts automatically and (once polling
    // reports COMPLETE) lands on the SELL success screen.
    await expect(page.getByRole("heading", { name: "All set! The withdrawal has been sent to your bank." })).toBeVisible({
      timeout: 45_000
    });
    await expect(page.getByText(journey.arrivalText)).toBeVisible();

    expect(backend.registerRequests).toHaveLength(1);
    const registerBody = backend.registerRequests[0] as {
      quoteId: string;
      signingAccounts: Array<{ type: string }>;
      additionalData?: { fiatAccountId?: string; pixDestination?: string; taxId?: string; walletAddress?: string };
    };
    expect(registerBody.quoteId).toBe("quote-e2e-1");
    expect(registerBody.signingAccounts.map(account => account.type).sort()).toEqual(["EVM", "Substrate"]);
    expect(registerBody.additionalData?.fiatAccountId).toBe(journey.fiatAccount.fiatAccountId);
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
}
