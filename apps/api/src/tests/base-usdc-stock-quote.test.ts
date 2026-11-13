import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocks } from "../database/migrations/089-add-stocks-partner";
import { up as seedUsdc } from "../database/migrations/090-add-stocks-usdc-pricing";
import QuoteTicket from "../models/quoteTicket.model";
import { setupTestDatabase, resetTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { installFakeWorld, type FakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const buy = {
  rampType: RampDirection.BUY,
  from: Networks.Base,
  to: Networks.Robinhood,
  network: Networks.Robinhood,
  inputCurrency: EvmToken.USDC,
  outputCurrency: EvmToken.NVDA,
  inputAmount: "1000"
};
const sell = {
  rampType: RampDirection.SELL,
  from: Networks.Robinhood,
  to: Networks.Base,
  network: Networks.Robinhood,
  inputCurrency: EvmToken.NVDA,
  outputCurrency: EvmToken.USDC,
  inputAmount: "1"
};

describe("Base native USDC stock contract", () => {
  let world: FakeWorld, app: TestApp, auth: { restore(): void };
  const enabled = config.stocks.usdcEnabledDirections;
  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    config.stocks.usdcEnabledDirections = enabled;
    await app?.close();
    auth?.restore();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocks(sequelize.getQueryInterface());
    await seedUsdc(sequelize.getQueryInterface());
    config.stocks.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setFeeEstimate(Networks.Robinhood, 30_000_000n, 0n);
    scriptRobinhoodChain(world.evm, 181n);
  });
  const post = (body: unknown) =>
    app.request("/v1/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  it.each([
    [buy, "BaseUsdcStockBuy"],
    [sell, "BaseUsdcStockSell"]
  ] as const)("quotes the exact crypto corridor", async (body, flow) => {
    const r = await post(body);
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(q.paymentMethod).toBe("usdc");
    expect(q.feeCurrency).toBe("USDC");
    expect(q.routingStrategy).toBe("direct");
    expect(Number(q.anchorFeeFiat)).toBe(0);
    expect(Number(q.partnerFeeFiat)).toBe(0);
    expect(q.gasless).toBe(true);
    expect(
      q.providerCosts
        .filter((c: { id: string }) => ["ramp", "conversion"].includes(c.id))
        .every((c: { amountFiat: string }) => Number(c.amountFiat) === 0)
    ).toBe(true);
    const ticket = await QuoteTicket.findByPk(q.id);
    expect((ticket!.metadata as any).flow.id).toBe(flow);
    expect(world.brla.pixInputTickets).toHaveLength(0);
    expect(world.brla.pixOutputTickets).toHaveLength(0);
    expect(world.brla.payoutQuoteAmounts).toHaveLength(0);
  });
  it("retains the 5 bps Vortex fee down to fractional USDC", async () => {
    const r = await post({ ...buy, inputAmount: "10.000001" });
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(q.vortexFeeFiat).toBe("0.005");
    expect(q.inputAmount).toBe("10.000001");
  });
  it("keeps crypto directions independently disabled", async () => {
    config.stocks.usdcEnabledDirections = [];
    expect((await post(buy)).status).toBe(400);
    const listing = await (
      await app.request("/v1/supported-cryptocurrencies?network=robinhood&paymentMethod=usdc")
    ).json();
    expect(listing.cryptocurrencies).toHaveLength(12);
    expect(listing.cryptocurrencies.every((x: { rampTypes: string[] }) => x.rampTypes.length === 0)).toBe(true);
  });
  it.each([
    { ...buy, from: Networks.Arbitrum },
    { ...buy, inputCurrency: EvmToken.USDT },
    { ...buy, inputAmount: "10.0000001" },
    { ...buy, inputAmount: "9.9" }
  ])("rejects non-native/wrong-chain or invalid precision/limits", async (body) => {
    expect((await post(body)).status).toBe(400);
  });
  async function register(body: typeof buy | typeof sell, quotedFor: string, additionalData: Record<string, string>) {
    const quoteResponse = await post({ ...body, destinationAddress: quotedFor });
    expect(quoteResponse.status, await quoteResponse.clone().text()).toBe(201);
    const q = await quoteResponse.json();
    const user = await createTestUser();
    return app.request("/v1/ramp/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${testUserToken(user.id)}` },
      body: JSON.stringify({
        quoteId: q.id,
        signingAccounts: [{ type: "EVM", address: privateKeyToAccount(generatePrivateKey()).address }],
        additionalData
      })
    });
  }
  it.each([buy, sell])("refuses a $rampType that funds from one wallet and delivers to another", async (body) => {
    const owner = privateKeyToAccount(generatePrivateKey()).address,
      other = privateKeyToAccount(generatePrivateKey()).address;
    for (const additionalData of [
      { walletAddress: other, destinationAddress: owner },
      { walletAddress: owner, destinationAddress: other }
    ]) {
      const r = await register(body, owner, additionalData);
      expect(r.status).toBe(400);
      expect(await r.text()).toContain("must use the same wallet");
    }
    // A buy without a destination already fails the generic onramp check; a sale reaches the same-wallet rule.
    expect((await register(body, owner, { walletAddress: owner })).status).toBe(400);
  });
  it("accepts the same wallet written in a different letter case", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const r = await register(sell, owner, { walletAddress: owner.toLowerCase(), destinationAddress: owner });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
  });
  it("registers a wallet-bound USDC buy without a fiat identity", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const r = await register(buy, owner, { walletAddress: owner, destinationAddress: owner });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
    const ramp = await r.json();
    expect(
      ramp.unsignedTxs.some(
        (x: { phase: string; network: string; signer: string }) =>
          x.phase === "stockPermitTransfer" && x.network === "base" && x.signer !== owner
      )
    ).toBe(true);
    expect(ramp.depositQrCode).toBeUndefined();
  });
});
