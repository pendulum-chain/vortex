import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import sequelize from "../config/database";
import { findPartnerWithPricing } from "../api/services/partners/partner-pricing.service";
import Partner from "../models/partner.model";
import PartnerPricingConfig from "../models/partnerPricingConfig.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { up as seedStocks } from "./migrations/089-add-stocks-partner";
import { down, up } from "./migrations/090-add-stocks-usdc-pricing";
describe("090 Stocks crypto pricing", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocks(sequelize.getQueryInterface());
    await up(sequelize.getQueryInterface());
  });
  it("is idempotent, preserves BRL overrides and reverts only the wildcard rows", async () => {
    const partner = (await Partner.findOne({ where: { name: "vortex-stocks" } }))!;
    await up(sequelize.getQueryInterface());
    expect(await PartnerPricingConfig.count({ where: { partnerId: partner.id } })).toBe(4);
    for (const d of [RampDirection.BUY, RampDirection.SELL]) {
      const brl = await findPartnerWithPricing({ name: "vortex-stocks" }, d, FiatToken.BRL);
      const crypto = await findPartnerWithPricing({ name: "vortex-stocks" }, d, EvmToken.USDC);
      expect(brl?.fiatCurrency).toBe(FiatToken.BRL);
      expect(crypto?.fiatCurrency).toBeNull();
      expect(Number(crypto?.vortexFeeValue)).toBe(0.0005);
      expect(Number(crypto?.targetDiscount)).toBe(0);
    }
    await down(sequelize.getQueryInterface());
    expect(await PartnerPricingConfig.count({ where: { partnerId: partner.id } })).toBe(2);
  });
  it("preserves an operator's preexisting wildcard during up and rollback", async () => {
    const partner = (await Partner.findOne({ where: { name: "vortex-stocks" } }))!;
    const operatorRow = (await PartnerPricingConfig.findOne({
      where: { partnerId: partner.id, rampType: RampDirection.BUY, fiatCurrency: null }
    }))!;
    const values = operatorRow.get({ plain: true });
    await operatorRow.destroy();
    const operatorId = "e16c2bbf-c748-4b2a-9980-cd036d0b7df6";
    await PartnerPricingConfig.create({ ...values, id: operatorId, vortexFeeValue: 0.0007 });
    await down(sequelize.getQueryInterface());
    await up(sequelize.getQueryInterface());
    const preserved = await findPartnerWithPricing({ name: "vortex-stocks" }, RampDirection.BUY, EvmToken.USDC);
    expect(Number(preserved?.vortexFeeValue)).toBe(0.0007);
    await down(sequelize.getQueryInterface());
    expect(await PartnerPricingConfig.count({ where: { partnerId: partner.id } })).toBe(3);
    expect(await PartnerPricingConfig.findByPk(operatorId)).not.toBeNull();
  });
});
