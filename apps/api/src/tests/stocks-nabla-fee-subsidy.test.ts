import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection, RELAY_BASE_USDC_ADDRESS } from "@vortexfi/shared";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocks } from "../database/migrations/089-add-stocks-partner";
import { up as seedUsdc } from "../database/migrations/090-add-stocks-usdc-pricing";
import QuoteTicket from "../models/quoteTicket.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { installFakeWorld, type FakeWorld } from "../test-utils/fake-world";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const bodies = [
  {
    rampType: RampDirection.BUY,
    from: "pix",
    to: Networks.Robinhood,
    network: Networks.Robinhood,
    inputCurrency: FiatToken.BRL,
    outputCurrency: EvmToken.NVDA,
    inputAmount: "5000"
  },
  {
    rampType: RampDirection.SELL,
    from: Networks.Robinhood,
    to: "pix",
    network: Networks.Robinhood,
    inputCurrency: EvmToken.NVDA,
    outputCurrency: FiatToken.BRL,
    inputAmount: "5"
  }
];
describe("Stocks-only Nabla fee rebate: HTTP quote contract", () => {
  let world: FakeWorld,
    app: TestApp,
    feeBps = 25n;
  const previous = { ...config.stocks };
  const reads: { name: string; blockNumber: unknown }[] = [];
  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    Object.assign(config.stocks, previous);
    await app?.close();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocks(sequelize.getQueryInterface());
    await seedUsdc(sequelize.getQueryInterface());
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    config.stocks.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    config.stocks.nablaUserFeeBps = 5;
    config.stocks.nablaMaxSubsidyBps = 20;
    feeBps = 25n;
    reads.length = 0;
    world.evm.onReadContract = (network, p) => {
      if (network !== Networks.Base) return undefined;
      if (["oracleAdapter", "getAssetPrice", "getAmountOut"].includes(p.functionName))
        reads.push({ name: p.functionName, blockNumber: (p as any).blockNumber });
      if (p.functionName === "oracleAdapter") return "0x00000000000000000000000000000000000000ab";
      if (p.functionName === "getAssetPrice") return 10n ** 18n;
      if (!["getAmountOut", "quoteSwapExactTokensForTokens"].includes(p.functionName)) return undefined;
      const amount = p.args![0] as bigint,
        fromUsdc = (p.args![1] as string[])[0].toLowerCase() === RELAY_BASE_USDC_ADDRESS.toLowerCase();
      const gross = fromUsdc ? amount * 5n * 10n ** 12n : amount / 5n / 10n ** 12n,
        fee = (gross * feeBps) / 10000n;
      return p.functionName === "getAmountOut" ? [gross - fee, fee] : gross - fee;
    };
    scriptRobinhoodChain(world.evm, 181n);
  });
  const post = (body: unknown) =>
    app.request("/v1/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  it.each(bodies)("rebates only the excess DEX fee in $rampType, including it in output once", async (body) => {
    const r = await post(body);
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(Number(q.nablaFeeSubsidy.chargedFeeBps)).toBe(25);
    expect(Number(q.nablaFeeSubsidy.effectiveFeeBps)).toBeCloseTo(5, 3);
    expect(Number(q.nablaFeeSubsidy.amountFiat)).toBeGreaterThan(0);
    const ticket = (await QuoteTicket.findByPk(q.id))!,
      metadata = ticket.metadata as any;
    const fee = metadata.blocks.nablaSwap.feeSubsidy,
      subsidy = metadata.blocks.subsidizePostSwap;
    expect(BigInt(fee.rebateRaw) + BigInt(fee.targetFeeRaw)).toBe(BigInt(fee.chargedFeeRaw));
    expect(subsidy.subsidyAmountInOutputTokenRaw).toBe(fee.rebateRaw);
    expect(BigInt(subsidy.targetOutputAmountRaw) - BigInt(subsidy.actualOutputAmountRaw)).toBe(BigInt(fee.rebateRaw));
    expect(reads.length).toBe(4);
    expect(reads.every((r) => r.blockNumber === 1n)).toBe(true);
    config.stocks.nablaUserFeeBps = undefined;
    const ordinary = await (await post(body)).json();
    expect(Number(q.outputAmount)).toBeGreaterThan(Number(ordinary.outputAmount));
    expect(ordinary.nablaFeeSubsidy).toBeUndefined();
  });
  it("fails closed when a DEX increase exceeds the configured treasury cap", async () => {
    feeBps = 30n;
    const r = await post(bodies[0]);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain("exceeds its configured budget");
  });
  it("does not touch native Base-USDC routes or ask for a Nabla fee", async () => {
    const r = await post({ ...bodies[0], from: Networks.Base, inputCurrency: EvmToken.USDC, inputAmount: "1000" });
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(q.nablaFeeSubsidy).toBeUndefined();
    expect(reads).toHaveLength(0);
  });
});
