import { expect, Page, test } from "@playwright/test";
import { buildQuoteResponse, buildRampProcess, E2E_RAMP_ID, mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";

const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";

// Critical journey 6: full BUY (onramp) journeys over the Alfredpay rail — the corridor
// family (MXN/USD/COP/ARS) the BRL journey never touches. The UI flow is identical for
// all four currencies (quote -> Buy -> email/OTP auth -> wallet ownership -> Alfredpay
// KYC gate on its happy path, an existing verified customer with alfredpayStatus=SUCCESS
// -> summary -> registration -> in-page ephemeral signing on POLYGON posted to
// /ramp/update -> "I have made the payment" -> /ramp/start -> progress -> success), so
// the journey is parameterized per currency. What differs — and what each case pins down
// — is the corridor's payment-method destination, the KYC-gate country, and the
// payment-instruction rendering (ONRAMP_DETAILS_BY_FIAT in
// src/components/widget-steps/SummaryStep/TransactionTokensDisplay.tsx):
//   MXN -> SPEI CLABE (MXNOnrampDetails)
//   USD -> ACH bank-detail rows (USOnrampDetails)
//   COP -> bank-transfer account details (COPOnrampDetails)
//   ARS -> COELSA CVU + alias (ARSOnrampDetails)

interface BuyJourneyCase {
  fiat: "MXN" | "USD" | "COP" | "ARS";
  /** Country the Alfredpay KYC gate must be queried for (ALFREDPAY_FIAT_TOKEN_TO_COUNTRY). */
  country: string;
  /** The corridor's payment-method destination (mapFiatToDestination in shared). */
  from: string;
  inputAmount: string;
  outputAmount: string;
  /** The anchor's fiat payment instructions returned on /ramp/update (AlfredpayFiatPaymentInstructions). */
  achPaymentData: Record<string, unknown>;
  /** Asserts the corridor's payment-instruction rendering after registration + signing. */
  assertPaymentInstructions: (page: Page) => Promise<void>;
}

const CASES: BuyJourneyCase[] = [
  {
    achPaymentData: {
      accountHolderName: "Vortex E2E",
      bankName: "STP",
      clabe: "646180157000000004",
      paymentType: "SPEI",
      reference: "VORTEX-E2E-REF-MX"
    },
    assertPaymentInstructions: async page => {
      // MXNOnrampDetails: the SPEI CLABE plus the payment reference.
      await expect(page.getByText("646180157000000004").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("VORTEX-E2E-REF-MX")).toBeVisible();
    },
    country: "MX",
    fiat: "MXN",
    from: "spei",
    inputAmount: "2000",
    outputAmount: "100"
  },
  {
    achPaymentData: {
      bankAccountNumber: "000123456789",
      bankBeneficiaryName: "Alfred Securities LLC",
      bankRoutingNumber: "026009593",
      paymentDescription: "Deposit the payment with the following reference number: VORTEXE2EREFUS01",
      paymentType: "ACH"
    },
    assertPaymentInstructions: async page => {
      // USOnrampDetails: ACH bank-detail rows, with the reference number extracted from
      // the anchor's paymentDescription sentence.
      await expect(page.getByText("000123456789").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("026009593")).toBeVisible();
      await expect(page.getByText("Alfred Securities LLC")).toBeVisible();
      await expect(page.getByText("VORTEXE2EREFUS01")).toBeVisible();
    },
    country: "US",
    fiat: "USD",
    from: "ach",
    inputAmount: "2000",
    outputAmount: "1990"
  },
  {
    achPaymentData: {
      accountHolderName: "Alfred Colombia SAS",
      bankAccountNumber: "123456789012",
      bankName: "Bancolombia",
      paymentType: "ACH",
      reference: "VORTEX-E2E-REF-CO"
    },
    assertPaymentInstructions: async page => {
      // COPOnrampDetails: destination bank account, bank name, and reference.
      await expect(page.getByText("123456789012").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Bancolombia")).toBeVisible();
      await expect(page.getByText("VORTEX-E2E-REF-CO")).toBeVisible();
    },
    country: "CO",
    fiat: "COP",
    from: "ach",
    inputAmount: "500000",
    outputAmount: "100"
  },
  {
    achPaymentData: {
      alias: "vortex.e2e.alias",
      cvu: "0000003100064567890123",
      paymentType: "COELSA",
      reference: "VORTEX-E2E-REF-AR"
    },
    assertPaymentInstructions: async page => {
      // ARSOnrampDetails: the COELSA CVU, alias, and reference.
      await expect(page.getByText("0000003100064567890123").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("vortex.e2e.alias").first()).toBeVisible();
      await expect(page.getByText("VORTEX-E2E-REF-AR")).toBeVisible();
    },
    country: "AR",
    fiat: "ARS",
    from: "cbu",
    inputAmount: "150000",
    outputAmount: "100"
  }
];

// The quote form displays amounts with locale grouping ("1990" renders as "1,990.00").
const displayedAmount = (amount: string) => new RegExp(Number(amount).toLocaleString("en-US"));

// The Alfredpay onramp's Polygon-side transactions signed by the EVM ephemeral
// (destinationTransfer + cleanup), mirroring alfredpay-to-evm.ts' direct-token path.
function buildBuyUnsignedTxs(evmEphemeral: string) {
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

for (const journey of CASES) {
  test(`BUY ${journey.fiat} journey: quote, auth, Alfredpay KYC gate, registration, signing, payment details, progress, success`, async ({
    page
  }) => {
    const rampFields = {
      depositQrCode: undefined,
      from: journey.from,
      inputAmount: journey.inputAmount,
      inputCurrency: journey.fiat,
      outputAmount: journey.outputAmount,
      outputCurrency: "USDT",
      to: "polygon",
      type: "BUY"
    };

    let unsignedTxs: unknown[] = [];
    const backend = await mockBackend(page, {
      quotes: body =>
        ({
          body: buildQuoteResponse({
            ...rampFields,
            feeCurrency: journey.fiat,
            inputAmount: body.inputAmount,
            rampType: "BUY"
          }),
          status: 200
        }) as { status: number; body: unknown },
      rampStatusOverrides: () => rampFields,
      register: body => {
        const signingAccounts = (body.signingAccounts ?? []) as Array<{ address: string; type: string }>;
        const evmEphemeral = signingAccounts.find(account => account.type === "EVM")?.address ?? POLYGON_USDT;
        unsignedTxs = buildBuyUnsignedTxs(evmEphemeral);
        return buildRampProcess({ ...rampFields, unsignedTxs });
      },
      update: () => buildRampProcess({ ...rampFields, achPaymentData: journey.achPaymentData, unsignedTxs })
    });
    await injectMockWallet(page);

    await page.goto(`/widget?rampType=BUY&fiat=${journey.fiat}&inputAmount=${journey.inputAmount}`);

    // Stage 1: the quote form fetched a BUY quote for the case's fiat currency.
    await expect(page.locator('input[name="outputAmount"]')).toHaveValue(displayedAmount(journey.outputAmount), {
      timeout: 20_000
    });
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

    // Stage 5: the Alfredpay KYC gate queried the customer status for the case's country
    // and, since the customer is verified (SUCCESS), the flow lands on the payment summary.
    await expect(page.getByRole("heading", { name: "Payment Summary" })).toBeVisible({ timeout: 20_000 });
    expect(backend.alfredpayStatusRequests).toContain(journey.country);

    // Stage 6: confirming registers the ramp and signs the Polygon transactions in-page;
    // the corridor's payment instructions from the update response are then displayed.
    await page.getByRole("button", { name: "Confirm" }).click();
    await journey.assertPaymentInstructions(page);

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
    const presignedTxs = (backend.updateRequests[0] as { presignedTxs: Array<{ txData: unknown; phase: string }> })
      .presignedTxs;
    expect(presignedTxs.map(tx => tx.phase).sort()).toEqual(["destinationTransfer", "polygonCleanup"]);
    for (const tx of presignedTxs) {
      expect(typeof tx.txData).toBe("string");
      expect(tx.txData as string).toMatch(/^0x02/);
    }

    // Stage 7: confirming the payment starts the ramp; once polling reports COMPLETE the
    // BUY success screen appears.
    await page.getByRole("button", { name: "I have made the payment" }).click();
    await expect(page.getByRole("heading", { name: "All set! Your tokens are on their way." })).toBeVisible({
      timeout: 45_000
    });
    expect(backend.startRequests).toHaveLength(1);
    expect(backend.startRequests[0]).toMatchObject({ rampId: E2E_RAMP_ID });
  });
}
