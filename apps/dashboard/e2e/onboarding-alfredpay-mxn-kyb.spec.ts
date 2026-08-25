import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

const documentFile = { buffer: Buffer.from("e2e-kyb-document"), mimeType: "application/pdf", name: "document.pdf" };

test("Alfredpay MX business KYB submits the questionnaire and six documents, and reaches provider approval", async ({
  page
}) => {
  const backend = await mockBackend(page, { alfredpayKyc: {}, companyMode: true });
  await seedSession(page);
  await page.goto("/overview");

  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Mexico/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  await page.getByRole("button", { name: "Start KYB" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("We'll create your Mexico business verification profile")).toBeVisible({ timeout: 20_000 });
  await wizard.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator('input[name="businessName"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('input[name="businessName"]').fill("Vortex Mexico SA de CV");
  await page.locator('input[name="taxId"]').fill("VME260714AB1");
  await page.locator('input[name="website"]').fill("https://vortexfinance.co");
  await page.locator('input[name="address"]').fill("Paseo de la Reforma 100");
  await page.locator('input[name="city"]').fill("Ciudad de Mexico");
  await page.locator('input[name="state"]').fill("CDMX");
  await page.locator('input[name="zipCode"]').fill("06600");
  await page.locator('input[name="repFirstName"]').fill("Maria");
  await page.locator('input[name="repLastName"]').fill("Gomez");
  await page.locator('input[name="repDateOfBirth"]').fill("1990-05-20");
  await page.locator('input[name="repDni"]').fill("GOMM900520MDFXYZ01");
  await wizard.getByRole("button", { name: "Continue" }).click();

  // Alfredpay's compliance questionnaire — it rejects the submission without these (110002).
  await expect(wizard.getByText("Compliance questionnaire")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[name="sourceOfFunds"]').fill("Sale of goods/services");
  await page.locator('input[name="businessActivities"]').fill("Cross-border payments software");
  await page.locator('input[name="accountPurpose"]').fill("Treasury management");
  await page.locator('input[name="walletAddresses"]').fill("N/A");
  await page.locator('input[name="expectedMonthlyVolumeUsd"]').fill("50000");
  await page.locator('input[name="expectedMonthlyTransactions"]').fill("120");
  await wizard.getByRole("button", { name: "Continue" }).click();

  // Six on the unregulated branch: the four company documents plus the representative's ID pair.
  await expect(wizard.getByText("All six files are required")).toBeVisible({ timeout: 20_000 });
  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs).toHaveCount(6);
  for (let index = 0; index < 6; index++) {
    await fileInputs.nth(index).setInputFiles({ ...documentFile, name: `document-${index + 1}.pdf` });
  }
  await wizard.getByRole("button", { name: "Submit documents" }).click();

  await expect(wizard.getByText("Alfredpay is reviewing your submission")).toBeVisible({ timeout: 20_000 });
  expect(backend.kybFormSubmissions).toEqual([
    expect.objectContaining({
      accountPurpose: "Treasury management",
      businessActivities: "Cross-border payments software",
      businessName: "Vortex Mexico SA de CV",
      country: "MX",
      expectedMonthlyTransactions: 120,
      expectedMonthlyVolumeUsd: 50000,
      isRegulatedBusiness: false,
      operatesInSanctionedCountries: false,
      relatedPersons: [
        expect.objectContaining({
          email: "e2e@vortexfinance.co",
          firstName: "Maria",
          lastName: "Gomez",
          nationalities: ["MX"],
          pep: false
        })
      ],
      sourceOfFunds: "Sale of goods/services",
      taxId: "VME260714AB1",
      transmitsCustomerFunds: false,
      walletAddresses: "N/A"
    })
  ]);
  // The questionnaire's conditionals stay off the wire while their triggers are false.
  const submitted = backend.kybFormSubmissions[0] as Record<string, unknown>;
  expect(submitted).not.toHaveProperty("conductsComplianceScreening");
  expect(submitted).not.toHaveProperty("complianceScreeningDescription");
  expect(backend.kybUploads).toEqual({ businessFiles: 4, relatedPersonFiles: 2 });
  // Alfredpay keys each document by fileType and rejects an unknown value, so the names matter as
  // much as the count. Unregulated: no businessLicense/uploadAmlPolicy.
  expect(backend.kybFileTypes).toEqual(["taxIdDocument", "articlesIncorporation", "proofAddress", "shareholderRegistry"]);
  expect(backend.kybRelatedPersonFileTypes).toEqual(["docFront", "docBack"]);
  // Finalization is a separate call from the polling below; assert it actually happened.
  expect(backend.kyc.submitted).toBe(true);

  backend.kyc.approved = true;
  await expect(wizard.getByText("Mexico KYB is complete")).toBeVisible({ timeout: 15_000 });
  await expect(wizard.getByRole("button", { name: "Done" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
