import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { findPartnerWithPricing } from "../api/services/partners/partner-pricing.service";
import sequelize from "../config/database";
import Partner from "../models/partner.model";
import PartnerPricingConfig from "../models/partnerPricingConfig.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestQuote } from "../test-utils/factories";
import { down, up } from "./migrations/089-add-stocks-partner";

const queryInterface = () => sequelize.getQueryInterface();
const stocksPartner = () => Partner.findOne({ where: { name: "vortex-stocks" } });

describe("089 stocks partner", () => {
  beforeAll(setupTestDatabase);

  beforeEach(async () => {
    await resetTestDatabase();
    await up(queryInterface());
  });

  it.each([RampDirection.BUY, RampDirection.SELL])("seeds active %s pricing for BRL only", async rampType => {
    const pricing = await findPartnerWithPricing({ name: "vortex-stocks" }, rampType, FiatToken.BRL);

    expect(pricing).toMatchObject({
      fiatCurrency: FiatToken.BRL,
      markupCurrency: EvmToken.USDC,
      markupType: "none",
      markupValue: "0.0000",
      maxSubsidy: "0.0000",
      targetDiscount: "0.0000",
      vortexFeeType: "relative",
      vortexFeeValue: "0.0005"
    });
    expect(await findPartnerWithPricing({ name: "vortex-stocks" }, rampType, FiatToken.MXN)).toBeNull();
  });

  it("can run twice without duplicating anything", async () => {
    const partner = await stocksPartner();

    await up(queryInterface());

    expect((await stocksPartner())?.id).toBe(partner?.id);
    expect(await PartnerPricingConfig.count({ where: { partnerId: partner?.id as string } })).toBe(2);
  });

  it("down removes the partner and its rows, keeps quote history and every other partner", async () => {
    const partner = (await stocksPartner()) as Partner;
    const quote = await createTestQuote({
      from: EPaymentMethod.PIX,
      network: Networks.Robinhood,
      outputCurrency: EvmToken.NVDA,
      pricingPartnerId: partner.id,
      to: Networks.Robinhood
    });
    const otherConfigs = await PartnerPricingConfig.count({ where: { partnerId: ((await Partner.findOne({ where: { name: "vortex" } })) as Partner).id } });

    await down(queryInterface());

    expect(await stocksPartner()).toBeNull();
    expect(await PartnerPricingConfig.count({ where: { partnerId: partner.id } })).toBe(0);
    expect((await quote.reload()).pricingPartnerId).toBeNull();
    const vortex = (await Partner.findOne({ where: { name: "vortex" } })) as Partner;
    expect(await PartnerPricingConfig.count({ where: { partnerId: vortex.id } })).toBe(otherConfigs);
  });

  it("up restores it after down, and down is safe when it is already gone", async () => {
    await down(queryInterface());
    await down(queryInterface());

    await up(queryInterface());

    expect(await findPartnerWithPricing({ name: "vortex-stocks" }, RampDirection.BUY, FiatToken.BRL)).not.toBeNull();
    expect(await findPartnerWithPricing({ name: "vortex-stocks" }, RampDirection.SELL, FiatToken.BRL)).not.toBeNull();
  });
});
