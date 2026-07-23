import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { FiatToken, RampDirection } from "@vortexfi/shared";
import express from "express";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestPartner } from "../../../test-utils/factories";
import { findPartnerWithPricing } from "../../services/partners/partner-pricing.service";
import partnerPricingConfigsRoutes from "../../routes/v1/admin/partner-pricing-configs.route";

const BASE_PATH = "/v1/admin/partner-pricing-configs";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

describe("partner pricing configs admin routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, partnerPricingConfigsRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function post(body: unknown, headers: Record<string, string> = ADMIN_HEADERS) {
    return fetch(baseUrl, { body: JSON.stringify(body), headers, method: "POST" });
  }

  it("rejects requests without the admin secret", async () => {
    const response = await post({ partnerName: "acme", rampType: "BUY" }, { "Content-Type": "application/json" });
    expect(response.status).toBe(401);
  });

  it("creates a fiat-scoped config that wins over the partner's wildcard row", async () => {
    const partner = await createTestPartner({ name: "acme", rampType: RampDirection.BUY, targetDiscount: 0.001 });

    const response = await post({
      fiatCurrency: FiatToken.MXN,
      maxSubsidy: 0.01,
      partnerName: "acme",
      rampType: "BUY",
      targetDiscount: 0.0001
    });

    expect(response.status).toBe(201);
    const { pricingConfig } = (await response.json()) as { pricingConfig: { fiatCurrency: string; partnerId: string } };
    expect(pricingConfig.fiatCurrency).toBe(FiatToken.MXN);
    expect(pricingConfig.partnerId).toBe(partner.id);

    const scoped = await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.MXN);
    expect(Number(scoped?.targetDiscount)).toBe(0.0001);
    const other = await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.BRL);
    expect(other?.fiatCurrency).toBeNull();
  });

  it("rejects an unknown fiat currency", async () => {
    await createTestPartner({ name: "acme", rampType: RampDirection.BUY });
    const response = await post({ fiatCurrency: "EURC", partnerName: "acme", rampType: "BUY" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PRICING_CONFIG_INPUT");
  });

  it("rejects an empty body with 400 instead of crashing", async () => {
    const response = await fetch(baseUrl, { headers: { Authorization: ADMIN_HEADERS.Authorization }, method: "POST" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_PRICING_CONFIG_INPUT");
  });

  it("requires markupCurrency when a fee type is active", async () => {
    await createTestPartner({ name: "acme", rampType: RampDirection.BUY });

    const missing = await post({ markupType: "relative", markupValue: 0.001, partnerName: "acme", rampType: "SELL" });
    expect(missing.status).toBe(400);
    const body = (await missing.json()) as { error: { message: string } };
    expect(body.error.message).toContain("markupCurrency");

    const withCurrency = await post({
      markupCurrency: "USDC",
      markupType: "relative",
      markupValue: 0.001,
      partnerName: "acme",
      rampType: "SELL"
    });
    expect(withCurrency.status).toBe(201);
  });

  it("returns 404 for an unknown partner and 409 for a duplicate scope", async () => {
    const missing = await post({ partnerName: "ghost", rampType: "BUY" });
    expect(missing.status).toBe(404);

    await createTestPartner({ name: "acme", rampType: RampDirection.BUY });
    const duplicate = await post({ partnerName: "acme", rampType: "BUY" });
    expect(duplicate.status).toBe(409);
    const body = (await duplicate.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PRICING_CONFIG_CONFLICT");
  });

  it("hard-deletes a config so the same scope can be re-created", async () => {
    const partner = await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });
    const config = await PartnerPricingConfig.findOne({ where: { partnerId: partner.id } });

    const response = await fetch(`${baseUrl}/${config?.id}`, { headers: ADMIN_HEADERS, method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.MXN)).toBeNull();

    const recreated = await post({ fiatCurrency: FiatToken.MXN, partnerName: "acme", rampType: "BUY" });
    expect(recreated.status).toBe(201);
  });

  it("refuses to delete the default vortex wildcard config", async () => {
    const vortex = await findPartnerWithPricing({ name: "vortex" }, RampDirection.BUY, FiatToken.BRL);
    const config = await PartnerPricingConfig.findOne({
      where: { fiatCurrency: null, partnerId: vortex?.id as string, rampType: RampDirection.BUY }
    });

    const response = await fetch(`${baseUrl}/${config?.id}`, { headers: ADMIN_HEADERS, method: "DELETE" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VORTEX_CONFIG_PROTECTED");
  });
});
