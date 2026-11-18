import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  type EvmTransactionData,
  FiatToken,
  isSignedTypedData,
  Networks,
  RampDirection,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// The Gold app's own request builder and quote check, run on what this API returns.
// @ts-expect-error The Gold app is plain JavaScript without declarations.
import { baseGoldRequest, validateBaseGoldQuote } from "../../../gold/src/lib/base-gold.js";
import { priceFeedService } from "../api/services/priceFeed.service";
import sequelize from "../config/database";
import { config } from "../config/vars";
import { up as seedStocks } from "../database/migrations/089-add-stocks-partner";
import { up as seedStocksUsdc } from "../database/migrations/090-add-stocks-usdc-pricing";
import { up as seedGoldPricing } from "../database/migrations/091-add-gold-usdc-pricing";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import {
  BASE_PANCAKE_V3_ROUTER,
  BASE_PAXG_ADDRESS,
  BASE_USDC_ADDRESS
} from "../api/services/phases/blocks/core/gold-base";
import { getEvmFundingAccount } from "../api/services/phases/blocks/core/evm-funding";
import { createTestTaxId, createTestUser } from "../test-utils/factories";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { scriptGoldBase } from "../test-utils/fake-world/gold-base";
import { scriptRobinhoodChain } from "../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../test-utils/test-app";

// Captured before the fake world replaces it.
const realConvertCurrency = priceFeedService.convertCurrency;

const PAXG = "PAXG";
const BRLA_ON_BASE = "0xfCB34c47f850f452C15EA1B84d51231C38A61783";
const TAX_ID = "12345678901";
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";
const usdcBuy = {
  from: Networks.Base,
  inputAmount: "100",
  inputCurrency: EvmToken.USDC,
  network: Networks.Base,
  outputCurrency: PAXG,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const usdcSell = {
  from: Networks.Base,
  inputAmount: "0.025",
  inputCurrency: PAXG,
  network: Networks.Base,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.SELL,
  to: Networks.Base
};
const pixBuy = {
  from: EPaymentMethod.PIX,
  inputAmount: "500",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  outputCurrency: PAXG,
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const pixSell = {
  from: Networks.Base,
  inputAmount: "0.025",
  inputCurrency: PAXG,
  network: Networks.Base,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};

describe("PAXG on Base quotes", () => {
  let world: FakeWorld, app: TestApp, auth: { restore(): void };
  const { enabledDirections, usdcEnabledDirections } = config.gold;
  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    config.gold.enabledDirections = enabledDirections;
    config.gold.usdcEnabledDirections = usdcEnabledDirections;
    await app?.close();
    auth?.restore();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    await seedGoldPricing(sequelize.getQueryInterface());
    config.gold.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    config.gold.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    // Nabla on Base at 5 BRL per USD: BRLA has 18 decimals, USDC 6.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      const [amountIn, [tokenIn]] = params.args as [bigint, string[]];
      return tokenIn.toLowerCase() === BRLA_ON_BASE.toLowerCase() ? amountIn / 5n / 10n ** 12n : amountIn * 5n * 10n ** 12n;
    };
    scriptGoldBase(world.evm, 4000n);
  });
  const post = (body: unknown) =>
    app.request("/v1/quotes", { body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, method: "POST" });
  const flowOf = async (id: string) =>
    ((await QuoteTicket.findByPk(id))?.metadata as unknown as { flow: { id: string } }).flow.id;

  it.each([
    [usdcBuy, "BaseUsdcGoldBuy"],
    [usdcSell, "BaseUsdcGoldSell"]
  ] as const)("quotes the USDC route of a $rampType with no fiat provider", async (body, flow) => {
    const r = await post(body);
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(q).toMatchObject({
      feeCurrency: "USDC",
      from: Networks.Base,
      gasless: true,
      inputCurrency: body.inputCurrency,
      network: Networks.Base,
      outputCurrency: body.outputCurrency,
      paymentMethod: "usdc",
      rampType: body.rampType,
      to: Networks.Base
    });
    expect(new Big(q.inputAmount).eq(body.inputAmount)).toBe(true);
    expect(Number(q.anchorFeeFiat)).toBe(0);
    expect(Number(q.partnerFeeFiat)).toBe(0);
    expect(Number(q.networkFeeFiat)).toBeGreaterThan(0);
    // No ETH reserve is taken from a Gold order.
    expect(q.gasReserveAmount ?? "0").toBe("0");
    expect(await flowOf(q.id)).toBe(flow);
    expect(world.brla.pixInputTickets).toHaveLength(0);
    expect(world.brla.pixOutputTickets).toHaveLength(0);
    expect(world.brla.payoutQuoteAmounts).toHaveLength(0);
  });

  it("charges the 5 bps Vortex fee and the Base gas, then swaps the rest at the pool price", async () => {
    const q = await (await post(usdcBuy)).json();
    expect(new Big(q.vortexFeeFiat).toString()).toBe("0.05");
    const swapped = new Big(100).minus(q.totalFeeFiat);
    // 4000 USDC per PAXG, 18 decimals.
    expect(new Big(q.outputAmount).toFixed(12)).toBe(swapped.div(4000).toFixed(12));
  });

  it("pays a sale's pool proceeds less the same fees", async () => {
    const q = await (await post(usdcSell)).json();
    // 0.025 PAXG at 4000 is 100 USDC.
    expect(new Big(q.outputAmount).toFixed(6)).toBe(new Big(100).minus(q.totalFeeFiat).toFixed(6));
    expect(new Big(q.vortexFeeFiat).toString()).toBe("0.05");
  });

  it.each([
    [
      "a USDC sale for BRL",
      { ...usdcSell, inputAmount: "100", inputCurrency: EvmToken.USDC, outputCurrency: FiatToken.BRL },
      "offramping from base to base is not supported."
    ],
    [
      "an ARS purchase of USDC",
      { ...usdcBuy, inputAmount: "100000", inputCurrency: FiatToken.ARS, outputCurrency: EvmToken.USDC },
      "onramping from base to base is not supported."
    ]
  ])("refuses %s with both ends on Base, whatever the Gold switches say", async (_label, body, message) => {
    // The generic flows do not check both ends of a request, so only Gold against USDC may pass chain support here.
    for (const directions of [[RampDirection.BUY, RampDirection.SELL], []]) {
      config.gold.enabledDirections = directions;
      config.gold.usdcEnabledDirections = directions;
      const r = await post(body);
      expect(r.status, await r.clone().text()).toBe(400);
      expect(await r.text()).toContain(message);
    }
    expect(await QuoteTicket.count()).toBe(0);
  });

  it.each([
    // 0.002 PAXG at 4000 is 8 USDC, below the 10 USDC a sale must pay out.
    ["0.002"],
    // 300 PAXG at 4000 is 1,200,000 USDC, above the limit.
    ["300"]
  ])("refuses a USDC sale of %s PAXG, whose proceeds are outside 10 to 1,000,000 USDC", async inputAmount => {
    const r = await post({ ...usdcSell, inputAmount });
    expect(r.status, await r.clone().text()).toBe(400);
    expect(await r.text()).toContain("USDC amount must be between 10 and 1000000");
  });

  it.each([
    [pixBuy, "BrlOnrampBaseGold", "BRL"],
    [pixSell, "BrlOfframpBaseGold", "BRL"]
  ] as const)("quotes the Pix route of a $rampType through the BRL corridor", async (body, flow, feeCurrency) => {
    const r = await post(body);
    expect(r.status, await r.clone().text()).toBe(201);
    const q = await r.json();
    expect(q).toMatchObject({ feeCurrency, network: Networks.Base, paymentMethod: "pix", rampType: body.rampType });
    expect(await flowOf(q.id)).toBe(flow);
    expect(Number(q.outputAmount)).toBeGreaterThan(0);
    if (body.rampType === RampDirection.SELL) expect(q.gasless).toBe(true);
  });

  it.each([
    ["BUY", "pix", "500"],
    ["SELL", "pix", "0.025"],
    ["BUY", "usdc", "100"],
    ["SELL", "usdc", "0.025"]
  ] as const)("returns a %s %s quote the Gold app accepts", async (direction, paymentMethod, amount) => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const request = baseGoldRequest({ amount, direction, owner, paymentMethod });
    // The app checks fee precision, and the fake converter does not round like the price feed does. A BRL quote is
    // therefore priced with the real converter. A USDC quote keeps the fake one: the fee module still converts USDC
    // components at 8 decimals, which is fixed apart from these routes.
    const fakeConvertCurrency = priceFeedService.convertCurrency;
    if (paymentMethod === "pix") priceFeedService.convertCurrency = realConvertCurrency;
    try {
      const r = await post(request);
      expect(r.status, await r.clone().text()).toBe(201);
      const accepted = validateBaseGoldQuote(await r.json(), request);
      expect(accepted.currency).toBe(paymentMethod === "usdc" ? "USDC" : "BRL");
      expect(accepted.grams).toBeGreaterThan(0);
    } finally {
      priceFeedService.convertCurrency = fakeConvertCurrency;
    }
  });

  /** Quotes for `owner`, registers with a fresh ephemeral, and returns the ramp as the client and the database see it. */
  async function register(body: Record<string, unknown>, owner: `0x${string}`, additionalData: Record<string, unknown>) {
    const quoteResponse = await post({ ...body, destinationAddress: owner });
    expect(quoteResponse.status, await quoteResponse.clone().text()).toBe(201);
    const quote = await quoteResponse.json();
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const ephemeral = privateKeyToAccount(generatePrivateKey()).address;
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({ additionalData, quoteId: quote.id, signingAccounts: [{ address: ephemeral, type: "EVM" }] }),
      headers: { Authorization: `Bearer ${testUserToken(user.id)}`, "Content-Type": "application/json" },
      method: "POST"
    });
    return { ephemeral, quote, response, userId: user.id };
  }
  const allUnsignedTxs = async (rampId: string) => ((await RampState.findByPk(rampId)) as RampState).unsignedTxs;
  const phases = (txs: UnsignedTx[], signer: string) =>
    txs.filter(tx => tx.signer.toLowerCase() === signer.toLowerCase()).map(tx => `${tx.phase}@${tx.nonce}`);
  const callOf = (tx: UnsignedTx) =>
    decodeFunctionData({ abi: erc20Abi, data: (tx.txData as EvmTransactionData).data as `0x${string}` });
  const funding = getEvmFundingAccount(Networks.Base).address;

  it("registers a USDC buy: one owner permit for the exact USDC, then pull, fees, swap and exact PAXG delivery on Base", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const { ephemeral, quote, response } = await register(usdcBuy, owner, { destinationAddress: owner, walletAddress: owner });
    expect(response.status, await response.clone().text()).toBe(201);
    const ramp = await response.json();
    // The owner's permit is withheld until the ephemeral's transactions are presigned.
    expect(ramp.unsignedTxs.every((tx: UnsignedTx) => tx.signer.toLowerCase() === ephemeral.toLowerCase())).toBe(true);
    expect(ramp.depositQrCode).toBeUndefined();

    const txs = await allUnsignedTxs(ramp.id);
    expect(txs.every(tx => tx.network === Networks.Base)).toBe(true);
    const permits = txs.filter(tx => tx.signer.toLowerCase() === owner.toLowerCase());
    expect(permits.map(tx => tx.phase)).toEqual(["goldPermitTransfer"]);
    const permit = permits[0].txData;
    if (!isSignedTypedData(permit)) throw new Error("the owner's request is not typed data");
    expect(permit.primaryType).toBe("Permit");
    expect(String(permit.domain.verifyingContract).toLowerCase()).toBe(BASE_USDC_ADDRESS.toLowerCase());
    expect(permit.message).toMatchObject({ owner, spender: ephemeral, value: "100000000" });

    expect(phases(txs, ephemeral)).toEqual([
      "goldPermitTransfer@0",
      "distributeFees@1",
      "uniswapApprove@2",
      "uniswapSwap@3",
      "destinationTransfer@4",
      "backupApprove@0",
      "baseCleanupUsdc@5",
      "baseCleanupPaxg@6"
    ]);
    const byPhase = (phase: string) => txs.find(tx => tx.phase === phase && tx.signer === ephemeral) as UnsignedTx;
    expect(callOf(byPhase("uniswapApprove")).args?.[0]).toBe(BASE_PANCAKE_V3_ROUTER);
    // Operator recovery of the swap's input.
    expect(callOf(byPhase("backupApprove"))).toMatchObject({ args: [funding, expect.any(BigInt)], functionName: "approve" });
    const delivery = byPhase("destinationTransfer");
    expect((delivery.txData as EvmTransactionData).to.toLowerCase()).toBe(BASE_PAXG_ADDRESS.toLowerCase());
    expect((delivery.txData as EvmTransactionData).value).toBe("0");
    expect(callOf(delivery)).toMatchObject({ args: [owner, parseUnits(quote.outputAmount, 18)], functionName: "transfer" });
  });

  it("registers a USDC sale: one owner permit for the exact PAXG, and exact USDC delivery on Base", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const { ephemeral, quote, response } = await register(usdcSell, owner, { destinationAddress: owner, walletAddress: owner });
    expect(response.status, await response.clone().text()).toBe(201);
    const txs = await allUnsignedTxs((await response.json()).id);
    const permit = (txs.find(tx => tx.signer.toLowerCase() === owner.toLowerCase()) as UnsignedTx).txData;
    if (!isSignedTypedData(permit)) throw new Error("the owner's request is not typed data");
    expect(String(permit.domain.verifyingContract).toLowerCase()).toBe(BASE_PAXG_ADDRESS.toLowerCase());
    expect(permit.domain.name).toBe("Paxos Gold");
    expect(permit.message).toMatchObject({ owner, spender: ephemeral, value: parseUnits("0.025", 18).toString() });

    expect(phases(txs, ephemeral)).toEqual([
      "goldPermitTransfer@0",
      "uniswapApprove@1",
      "uniswapSwap@2",
      "distributeFees@3",
      "destinationTransfer@4",
      "backupApprove@0",
      "baseCleanupUsdc@5"
    ]);
    const delivery = txs.find(tx => tx.phase === "destinationTransfer") as UnsignedTx;
    expect((delivery.txData as EvmTransactionData).to.toLowerCase()).toBe(BASE_USDC_ADDRESS.toLowerCase());
    expect(callOf(delivery)).toMatchObject({ args: [owner, parseUnits(quote.outputAmount, 6)], functionName: "transfer" });
  });

  it.each([usdcBuy, usdcSell])("refuses a USDC $rampType that funds from one wallet and delivers to another", async body => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const { response } = await register(body, owner, { destinationAddress: owner, walletAddress: other });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Gold USDC funding and delivery must use the same wallet");
  });

  it("registers a Pix buy with a deposit code and exact PAXG delivery, and no wallet request", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const { ephemeral, quote, response } = await register(pixBuy, owner, { destinationAddress: owner, taxId: TAX_ID });
    expect(response.status, await response.clone().text()).toBe(201);
    const ramp = await response.json();
    // The Pix code exists, and is released to the client once the ephemeral's transactions are presigned.
    expect(ramp.depositQrCode).toBeUndefined();
    expect(((await RampState.findByPk(ramp.id)) as RampState).state.depositQrCode).toBeTruthy();
    const txs = await allUnsignedTxs(ramp.id);
    expect(txs.every(tx => tx.signer.toLowerCase() === ephemeral.toLowerCase())).toBe(true);
    expect(txs.map(tx => tx.phase)).not.toContain("goldPermitTransfer");
    expect(txs.map(tx => tx.phase)).toEqual(expect.arrayContaining(["uniswapApprove", "uniswapSwap", "backupApprove", "baseCleanupPaxg"]));
    const delivery = txs.find(tx => tx.phase === "destinationTransfer") as UnsignedTx;
    expect((delivery.txData as EvmTransactionData).to.toLowerCase()).toBe(BASE_PAXG_ADDRESS.toLowerCase());
    expect(callOf(delivery)).toMatchObject({ args: [owner, parseUnits(quote.outputAmount, 18)], functionName: "transfer" });
  });

  it("registers a Pix sale with one owner permit for the PAXG and no Base delivery", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const { ephemeral, response } = await register(pixSell, owner, {
      pixDestination: PIX_KEY,
      receiverTaxId: RECEIVER_TAX_ID,
      taxId: TAX_ID,
      walletAddress: owner
    });
    expect(response.status, await response.clone().text()).toBe(201);
    const txs = await allUnsignedTxs((await response.json()).id);
    const permits = txs.filter(tx => tx.signer.toLowerCase() === owner.toLowerCase());
    expect(permits.map(tx => tx.phase)).toEqual(["goldPermitTransfer"]);
    const ephemeralPhases = txs.filter(tx => tx.signer.toLowerCase() === ephemeral.toLowerCase()).map(tx => tx.phase);
    expect(ephemeralPhases.slice(0, 3)).toEqual(["goldPermitTransfer", "uniswapApprove", "uniswapSwap"]);
    expect(ephemeralPhases).toEqual(expect.arrayContaining(["nablaApprove", "nablaSwap", "backupApprove"]));
    expect(ephemeralPhases).not.toContain("destinationTransfer");
  });

  it("keeps one open Gold order per account, apart from any stock sale", async () => {
    const owner = privateKeyToAccount(generatePrivateKey()).address;
    const first = await register(usdcSell, owner, { destinationAddress: owner, walletAddress: owner });
    expect(first.response.status).toBe(201);
    const rampId = (await first.response.json()).id;
    const quote = await (await post({ ...usdcBuy, destinationAddress: owner })).json();
    const again = () =>
      app.request("/v1/ramp/register", {
        body: JSON.stringify({
          additionalData: { destinationAddress: owner, walletAddress: owner },
          quoteId: quote.id,
          signingAccounts: [{ address: privateKeyToAccount(generatePrivateKey()).address, type: "EVM" }]
        }),
        headers: { Authorization: `Bearer ${testUserToken(first.userId)}`, "Content-Type": "application/json" },
        method: "POST"
      });
    const refused = await again();
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain(`A gold order is already in progress (${rampId})`);
    // The lock reads Gold's own block state, so a finished order frees it.
    await RampState.update({ currentPhase: "failed" }, { where: { id: rampId } });
    expect((await again()).status).toBe(201);
  });

  it("lets one account hold a Gold order and a stock sale together, each under its own lock", async () => {
    const stockSell = {
      from: Networks.Robinhood,
      inputAmount: "1",
      inputCurrency: EvmToken.NVDA,
      network: Networks.Robinhood,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.SELL,
      to: Networks.Base
    };
    const stocksUsdcDirections = config.stocks.usdcEnabledDirections;
    config.stocks.usdcEnabledDirections = [RampDirection.SELL];
    await seedStocks(sequelize.getQueryInterface());
    await seedStocksUsdc(sequelize.getQueryInterface());
    world.evm.setFeeEstimate(Networks.Robinhood, 30_000_000n, 0n);
    scriptRobinhoodChain(world.evm, 181n);
    scriptGoldBase(world.evm, 4000n);
    try {
      const owner = privateKeyToAccount(generatePrivateKey()).address;
      const gold = await register(usdcSell, owner, { destinationAddress: owner, walletAddress: owner });
      expect(gold.response.status, await gold.response.clone().text()).toBe(201);
      const registerAgain = async (body: Record<string, unknown>) => {
        const quote = await (await post({ ...body, destinationAddress: owner })).json();
        return app.request("/v1/ramp/register", {
          body: JSON.stringify({
            additionalData: { destinationAddress: owner, walletAddress: owner },
            quoteId: quote.id,
            signingAccounts: [{ address: privateKeyToAccount(generatePrivateKey()).address, type: "EVM" }]
          }),
          headers: { Authorization: `Bearer ${testUserToken(gold.userId)}`, "Content-Type": "application/json" },
          method: "POST"
        });
      };

      // The open Gold order does not stand in the way of a stock sale.
      const stock = await registerAgain(stockSell);
      expect(stock.status, await stock.clone().text()).toBe(201);
      // Each lock still refuses a second order of its own kind, and names it.
      const secondGold = await registerAgain(usdcBuy);
      expect(secondGold.status).toBe(409);
      expect(await secondGold.text()).toContain("A gold order is already in progress");
      const secondStock = await registerAgain(stockSell);
      expect(secondStock.status).toBe(409);
      expect(await secondStock.text()).toContain("A stock sale is already in progress");
    } finally {
      config.stocks.usdcEnabledDirections = stocksUsdcDirections;
    }
  });
});
