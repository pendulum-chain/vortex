import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestPartner, updatePartnerPricing } from "../../../test-utils/factories";
import { QuoteContext } from "../quote/core/types";
import { resolveDiscountPartner } from "../quote/engines/discount/helpers";
import { findPartnerWithPricing } from "./partner-pricing.service";

describe("findPartnerWithPricing fiat-currency scoping", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("prefers a corridor-scoped config over the wildcard row", async () => {
    const partner = await createTestPartner({ name: "acme", rampType: RampDirection.BUY, targetDiscount: 0.001 });
    await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });

    const pricing = await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.MXN);

    expect(pricing).not.toBeNull();
    expect(pricing?.fiatCurrency).toBe(FiatToken.MXN);
    expect(Number(pricing?.targetDiscount)).toBe(0.0001);
  });

  it("falls back to the wildcard config for a non-matching corridor", async () => {
    const partner = await createTestPartner({ name: "acme", rampType: RampDirection.BUY, targetDiscount: 0.001 });
    await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });

    const pricing = await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.BRL);

    expect(pricing).not.toBeNull();
    expect(pricing?.fiatCurrency).toBeNull();
    expect(Number(pricing?.targetDiscount)).toBe(0.001);
  });

  it("returns null when the partner only has configs scoped to other corridors", async () => {
    const partner = await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });

    const pricing = await findPartnerWithPricing({ id: partner.id }, RampDirection.BUY, FiatToken.BRL);

    expect(pricing).toBeNull();
  });
});

describe("resolveDiscountPartner fiat-currency scoping", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function contextFor(partnerId: string, inputCurrency: FiatToken): QuoteContext {
    return {
      partner: { id: partnerId },
      request: { inputCurrency, outputCurrency: EvmToken.USDC, rampType: RampDirection.BUY }
    } as QuoteContext;
  }

  it("uses the corridor-scoped discount and a corridor-scoped state key", async () => {
    const partner = await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });

    const active = await resolveDiscountPartner(contextFor(partner.id, FiatToken.MXN), RampDirection.BUY);

    expect(active?.id).toBe(partner.id);
    expect(Number(active?.targetDiscount)).toBe(0.0001);
    expect(active?.stateKey).toBe(`${partner.id}:${RampDirection.BUY}:${FiatToken.MXN}`);
  });

  it("falls back to the vortex default for corridors outside the partner's scope", async () => {
    const partner = await createTestPartner({
      fiatCurrency: FiatToken.MXN,
      name: "acme",
      rampType: RampDirection.BUY,
      targetDiscount: 0.0001
    });
    await updatePartnerPricing("vortex", RampDirection.BUY, { targetDiscount: 0.002 });

    const active = await resolveDiscountPartner(contextFor(partner.id, FiatToken.BRL), RampDirection.BUY);

    expect(active?.name).toBe("vortex");
    expect(Number(active?.targetDiscount)).toBe(0.002);
    expect(active?.stateKey?.endsWith(":*")).toBe(true);
  });
});
