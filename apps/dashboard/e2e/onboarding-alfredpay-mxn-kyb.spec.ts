import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

const documentFile = { buffer: Buffer.from("e2e-kyb-document"), mimeType: "application/pdf", name: "document.pdf" };

test("Alfredpay MX business KYB submits five documents and reaches provider approval", async ({ page }) => {
  const backend = await mockBackend(page, { alfredpayKyc: {}, companyMode: true });
  await seedSession(page);
  await page.goto("/dashboard/overview");

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

  await expect(wizard.getByText("All five files are required")).toBeVisible({ timeout: 20_000 });
  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await fileInputs.nth(index).setInputFiles({ ...documentFile, name: `document-${index + 1}.pdf` });
  }
  await wizard.getByRole("button", { name: "Submit documents" }).click();

  await expect(wizard.getByText("Alfredpay is reviewing your submission")).toBeVisible({ timeout: 20_000 });
  expect(backend.kybFormSubmissions).toEqual([
    expect.objectContaining({
      businessName: "Vortex Mexico SA de CV",
      country: "MX",
      relatedPersons: [
        expect.objectContaining({ email: "e2e@vortexfinance.co", firstName: "Maria", lastName: "Gomez", nationalities: ["MX"] })
      ],
      taxId: "VME260714AB1"
    })
  ]);
  expect(backend.kybUploads).toEqual({ businessFiles: 3, relatedPersonFiles: 2 });

  backend.kyc.approved = true;
  await expect(wizard.getByText("Mexico KYB is complete")).toBeVisible({ timeout: 15_000 });
  await expect(wizard.getByRole("button", { name: "Done" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
