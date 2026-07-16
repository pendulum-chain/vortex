import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";

// Critical journey: invited-recipient US individual KYC. A recipient opens
// /widget?invite=<token>&kybLocked=US, authenticates via email/OTP, the invite is redeemed
// (POST /v1/recipients/invite/:token/accept sets customerType=individual and fiatToken=USD
// from the invitation), the region selector is skipped because kybLocked pins US, and the
// quote-less flow lands in the Alfredpay hosted-link KYC for a brand-new customer:
// alfredpayStatus 404 -> CustomerDefinition -> createIndividualCustomer -> getKycRedirectLink
// -> open link (popup) -> kycRedirectOpened -> "I have finished" -> kycRedirectFinished ->
// getKycStatus polling flips to SUCCESS -> KYC done -> KybLinkComplete success screen.

const INVITE_TOKEN = "e2e-invite-token";
// ".invalid" never resolves, so an accidental real call fails loudly; the popup itself is
// served by a context route below.
const VERIFICATION_URL = "https://verification.alfredpay.invalid/session/e2e-1";

test("invited US individual: invite redemption, locked region, Alfredpay hosted-link KYC, success screen", async ({ page }) => {
  // Base harness: auth (email/OTP), quotes, and third-party blocking. Its generic Alfredpay
  // handlers are shadowed for this journey by the more specific routes below (Playwright
  // matches the most recently registered route first).
  await mockBackend(page);

  const acceptRequests: string[] = [];
  await page.route("http://localhost:3000/v1/recipients/invite/**", async route => {
    const url = new URL(route.request().url());
    acceptRequests.push(url.pathname);
    // AcceptedRecipientInvite (packages/shared/src/endpoints/recipient.endpoints.ts), mirroring
    // acceptInvite in apps/api/src/api/controllers/recipients.controller.ts (201 on first acceptance).
    await route.fulfill({
      json: {
        id: "sender-recipient-e2e-1",
        invitation: {
          country: "US",
          id: "invitation-1",
          inviteeType: "individual",
          payoutCurrency: "usd",
          rail: "usd"
        },
        relationshipStatus: "active"
      },
      status: 201
    });
  });

  // The Alfredpay hosted-link (US) KYC flow for a brand-new customer. `kycRedirectFinished`
  // is the pivot: getKycStatus reports LINK_OPENED (non-terminal, keeps the machine polling)
  // until the widget notifies completion, then flips to SUCCESS.
  const createCustomerRequests: Array<Record<string, unknown>> = [];
  const redirectOpenedRequests: Array<Record<string, unknown>> = [];
  const kycStatusRequests: string[] = [];
  let redirectFinished = false;
  await page.route("http://localhost:3000/v1/alfredpay/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    switch (url.pathname) {
      // No customer yet: the 404 routes the machine to CustomerDefinition (checkStatus onError).
      case "/v1/alfredpay/alfredpayStatus":
        await route.fulfill({ json: { error: "Customer not found" }, status: 404 });
        return;
      case "/v1/alfredpay/createIndividualCustomer":
        createCustomerRequests.push(request.postDataJSON() as Record<string, unknown>);
        // AlfredpayCreateCustomerResponse
        await route.fulfill({ json: { createdAt: new Date().toISOString() } });
        return;
      case "/v1/alfredpay/getKycRedirectLink":
        // AlfredpayGetKycRedirectLinkResponse
        await route.fulfill({ json: { submissionId: "submission-e2e-1", verification_url: VERIFICATION_URL } });
        return;
      case "/v1/alfredpay/kycRedirectOpened":
        redirectOpenedRequests.push(request.postDataJSON() as Record<string, unknown>);
        await route.fulfill({ json: { success: true } });
        return;
      case "/v1/alfredpay/kycRedirectFinished":
        redirectFinished = true;
        await route.fulfill({ json: { success: true } });
        return;
      case "/v1/alfredpay/getKycStatus":
        kycStatusRequests.push(url.searchParams.get("type") ?? "");
        // AlfredpayGetKycStatusResponse
        await route.fulfill({
          json: {
            alfred_pay_id: "alfred-e2e-1",
            country: "US",
            status: redirectFinished ? "SUCCESS" : "LINK_OPENED",
            updated_at: new Date().toISOString()
          }
        });
        return;
      default:
        await route.fulfill({ json: {}, status: 404 });
    }
  });

  // The provider-hosted verification page opened via window.open: serve a stub from within
  // the browser context so the popup loads hermetically.
  await page
    .context()
    .route(`${new URL(VERIFICATION_URL).origin}/**`, route =>
      route.fulfill({ body: "<html><body>Alfredpay hosted verification stub</body></html>", contentType: "text/html" })
    );

  await page.goto(`/widget?invite=${INVITE_TOKEN}&kybLocked=US`);

  // Stage 1: the deep link jumps straight into the email/OTP auth gate — no quote form.
  await expect(page.getByRole("heading", { name: "Verify Your Email" })).toBeVisible({ timeout: 20_000 });
  await page.locator("#email").fill("e2e@vortexfinance.co");
  await page.locator("#terms").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter Verification Code" })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially("123456");

  // Stage 2: post-auth the invite is redeemed and — the region being locked and the invitation
  // pinning USD — the flow lands directly on the Alfredpay customer-definition screen.
  await expect(page.getByText("Please continue with our partner for the KYC verification.")).toBeVisible({
    timeout: 20_000
  });
  // The locked region skipped the selector entirely.
  await expect(page.getByText("Select Your Region")).toHaveCount(0);
  // The invite pinned the recipient type — the register-as-business toggle is not offered.
  await expect(page.getByText(/register as business/)).toHaveCount(0);
  // The accept endpoint was called with the token from the URL.
  expect(acceptRequests).toEqual([`/v1/recipients/invite/${INVITE_TOKEN}/accept`]);

  // Stage 3: accepting as individual creates the customer and fetches the hosted KYC link.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("complete the KYC process with our partner AlfredPay")).toBeVisible({ timeout: 20_000 });
  expect(createCustomerRequests).toEqual([{ country: "US" }]);

  // Stage 4: opening the link pops the provider-hosted page and notifies the backend.
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open KYC Link" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(VERIFICATION_URL);
  await popup.close();

  // Stage 5: back in the widget, the filling screen waits for the user to finish externally.
  await expect(page.getByRole("button", { name: "I have finished the KYC verification" })).toBeVisible({
    timeout: 20_000
  });
  expect(redirectOpenedRequests).toEqual([{ country: "US", type: "INDIVIDUAL" }]);

  // Stage 6: confirming completion flips getKycStatus to SUCCESS; polling picks it up.
  await page.getByRole("button", { name: "I have finished the KYC verification" }).click();
  await expect(page.getByText("KYC Completed!")).toBeVisible({ timeout: 30_000 });
  expect(kycStatusRequests.length).toBeGreaterThanOrEqual(1);
  expect(kycStatusRequests).toContain("INDIVIDUAL");

  // Stage 7: continuing lands on the invite flow's terminal success screen (KybLinkComplete),
  // which for an invited individual also reads KYC — never KYB.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("KYC Completed!")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("KYB Completed!")).toHaveCount(0);
  await expect(page.getByText("Your account has been verified. You can now proceed.")).toBeVisible();
});
