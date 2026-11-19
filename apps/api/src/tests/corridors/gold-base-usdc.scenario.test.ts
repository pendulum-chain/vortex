import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EvmToken,
  Networks,
  type PresignedTx,
  RampDirection,
  type SignedTypedData,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { TypedDataEncoder } from "ethers";
import { parseEther, parseSignature, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { BASE_PAXG_ADDRESS, BASE_USDC_ADDRESS } from "../../api/services/phases/blocks/core/gold-base";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import { up as seedGoldPricing } from "../../database/migrations/091-add-gold-usdc-pricing";
import RampState from "../../models/rampState.model";
import Subsidy from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeChainIdRpc, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { applyGoldRouterTx, scriptGoldBase } from "../../test-utils/fake-world/gold-base";
import { TokenLedger } from "../../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const USDC = BASE_USDC_ADDRESS;
const PAXG = BASE_PAXG_ADDRESS;
const PAYOUT = "0x000000000000000000000000000000000000fee5";
const PRICE_USD = 4000n;
const FUNDING = getEvmFundingAccount(Networks.Base).address;

describe("Gold on Base with native USDC: real executors, simulated chain", () => {
  let world: FakeWorld, app: TestApp, auth: { restore(): void }, restoreRpc: () => void;
  const { usdcEnabledDirections } = config.gold;
  beforeAll(async () => {
    world = installFakeWorld();
    restoreRpc = installFakeChainIdRpc();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    config.gold.usdcEnabledDirections = usdcEnabledDirections;
    await app?.close();
    auth?.restore();
    restoreRpc?.();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    await seedGoldPricing(sequelize.getQueryInterface());
    // The fee distribution pays the vortex partner's EVM address.
    for (const direction of [RampDirection.BUY, RampDirection.SELL]) {
      await updatePartnerPricing("vortex", direction, { payoutAddressEvm: PAYOUT });
    }
    config.gold.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.strictReceipts = true;
    world.evm.sentTransactions.length = 0;
    world.evm.revertedReceiptHashes.clear();
    world.evm.receiptLogs.clear();
    world.evm.onSimulateContract = undefined;
    world.evm.onTransaction = undefined;
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setNativeBalance(Networks.Base, FUNDING, parseEther("10"));
    world.evm.setErc20Balance(Networks.Base, USDC, FUNDING, parseUnits("10000", 6));
    world.evm.setErc20Balance(Networks.Base, USDC, PAYOUT, 0n);
    world.evm.onReadContract = (network, params) => {
      if (network !== Networks.Base || params.address.toLowerCase() !== USDC.toLowerCase()) return undefined;
      if (params.functionName === "name") return "USD Coin";
      if (params.functionName === "version") return "2";
      if (params.functionName === "DOMAIN_SEPARATOR") {
        return TypedDataEncoder.hashDomain({ chainId: 8453, name: "USD Coin", verifyingContract: USDC, version: "2" });
      }
      return undefined;
    };
    scriptGoldBase(world.evm, PRICE_USD);
  });

  async function post(path: string, body: unknown, userId?: string) {
    const response = await app.request(path, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${testUserToken(userId)}` } : {}) },
      method: "POST"
    });
    expect(response.status, `${path}: ${await response.clone().text()}`).toBeLessThan(300);
    return response.json();
  }

  /**
   * Quotes, registers, presigns as the ephemeral, signs the owner's permit, and wires the simulated chain. `leakRaw` of
   * the swap's output leaves the ephemeral right after the swap, as a transfer signed with the ephemeral's key would.
   */
  async function setup(
    direction: RampDirection,
    {
      fillBps = 10_000n,
      leakRaw = 0n,
      movesAfterApprovalBps,
      size = 1
    }: { fillBps?: bigint; leakRaw?: bigint; movesAfterApprovalBps?: bigint; size?: number } = {}
  ) {
    const buy = direction === RampDirection.BUY;
    const owner = privateKeyToAccount(generatePrivateKey());
    const secret = generatePrivateKey();
    const ephemeral = privateKeyToAccount(secret);
    const user = await createTestUser();
    const amount = new Big(buy ? "100" : "0.025").mul(size).toString();
    const sourceToken = buy ? USDC : PAXG;
    world.evm.setNativeBalance(Networks.Base, owner.address, 0n);
    world.evm.setErc20Balance(Networks.Base, sourceToken, owner.address, parseUnits(amount, buy ? 6 : 18));

    const quote = await post("/v1/quotes", {
      destinationAddress: owner.address,
      from: Networks.Base,
      inputAmount: amount,
      inputCurrency: buy ? EvmToken.USDC : "PAXG",
      network: Networks.Base,
      outputCurrency: buy ? "PAXG" : EvmToken.USDC,
      rampType: direction,
      to: Networks.Base
    });
    const registered = await post(
      "/v1/ramp/register",
      {
        additionalData: { destinationAddress: owner.address, walletAddress: owner.address },
        quoteId: quote.id,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      },
      user.id
    );
    const signed = await signUnsignedTransactions(registered.unsignedTxs, {
      evmEphemeral: { address: ephemeral.address, secret }
    });
    const ledger = new TokenLedger(world.evm, PRICE_USD, ephemeral.address, {
      [PAXG.toLowerCase()]: { name: "Paxos Gold", version: "1" },
      [USDC.toLowerCase()]: { name: "USD Coin", version: "2" }
    });
    const outputToken = buy ? PAXG : USDC;
    // With `movesAfterApprovalBps`, the pool pays only that share of its earlier price once the swap's approval is
    // mined: the quoter and the router both answer at the new price from then on.
    const approval = signed.find(tx => tx.phase === "uniswapApprove")?.txData as string;
    let poolBps = fillBps;
    const quoted = world.evm.onSimulateContract;
    world.evm.onSimulateContract = (network, params) => {
      const result = quoted?.(network, params);
      if (poolBps === fillBps || params.functionName === "quoteExactOutputSingle" || !Array.isArray(result)) return result;
      return [((result[0] as bigint) * poolBps) / 10_000n, ...result.slice(1)];
    };
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      applyGoldRouterTx(world.evm, ledger, tx, ephemeral.address, PRICE_USD, poolBps);
      if (movesAfterApprovalBps && tx.serialized === approval) poolBps = movesAfterApprovalBps;
      if (leakRaw > 0n && world.evm.receiptLogs.has(tx.hash)) {
        const held = world.evm.erc20Balance(Networks.Base, outputToken, ephemeral.address);
        world.evm.setErc20Balance(Networks.Base, outputToken, ephemeral.address, held - leakRaw);
      }
    };

    const updated = await post("/v1/ramp/update", { presignedTxs: signed, rampId: registered.id }, user.id);
    const permit = updated.unsignedTxs.find((tx: UnsignedTx) => tx.signer.toLowerCase() === owner.address.toLowerCase());
    expect(permit.phase).toBe("goldPermitTransfer");
    const payload = permit.txData as SignedTypedData;
    const { r, s, v } = parseSignature(await owner.signTypedData(payload as Parameters<typeof owner.signTypedData>[0]));
    const authorization = {
      ...permit,
      txData: [{ ...payload, signature: { deadline: Number(payload.message.deadline), r, s, v: Number(v) } }]
    } as PresignedTx;
    await post("/v1/ramp/update", { presignedTxs: [authorization], rampId: registered.id }, user.id);
    const presignedSwap = signed.find(tx => tx.phase === "uniswapSwap")?.txData as `0x${string}`;
    return { ephemeral, owner, presignedSwap, quote, rampId: registered.id as string, sourceToken, userId: user.id };
  }

  async function settle(rampId: string) {
    const until = Date.now() + 60_000;
    for (;;) {
      const ramp = (await RampState.findByPk(rampId)) as RampState;
      if (ramp.currentPhase !== "initial" && !ramp.processingLock.locked) return ramp;
      if (Date.now() > until) throw new Error(`stuck in ${ramp.currentPhase}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const balance = (token: string, holder: string) => world.evm.erc20Balance(Networks.Base, token, holder);

  it.each([RampDirection.BUY, RampDirection.SELL])(
    "completes a %s with one permit, no customer ETH and no fiat provider",
    async direction => {
      const buy = direction === RampDirection.BUY;
      const x = await setup(direction);
      await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
      const final = await settle(x.rampId);
      expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");

      // The owner receives exactly the quoted amount and keeps nothing of what was sold.
      expect(balance(buy ? PAXG : USDC, x.owner.address)).toBe(parseUnits(x.quote.outputAmount, buy ? 18 : 6));
      expect(balance(x.sourceToken, x.owner.address)).toBe(0n);
      expect(world.evm.nativeBalance(Networks.Base, x.owner.address)).toBe(0n);
      // Network and Vortex fees reach the payout address in USDC.
      expect(balance(USDC, PAYOUT)).toBe(parseUnits(new Big(x.quote.totalFeeFiat).toFixed(6), 6));
      // The pool filled at the quote, so nothing was topped up.
      expect(await Subsidy.count({ where: { rampId: x.rampId } })).toBe(0);
      expect(world.brla.pixInputTickets).toHaveLength(0);
      expect(world.brla.pixOutputTickets).toHaveLength(0);
    },
    90_000
  );

  it("tops a buy up to the exact quoted PAXG when the pool fills 0.5% short", async () => {
    const x = await setup(RampDirection.BUY, { fillBps: 9_950n });
    const fundingUsdcBefore = balance(USDC, FUNDING);
    await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
    const final = await settle(x.rampId);
    expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");

    expect(balance(PAXG, x.owner.address)).toBe(parseUnits(x.quote.outputAmount, 18));
    const subsidies = await Subsidy.findAll({ where: { rampId: x.rampId } });
    expect(subsidies.map(subsidy => [subsidy.phase, subsidy.token])).toEqual([["goldSettlementTopUp", "PAXG"]]);
    // About 0.5% of a 100 USDC buy, paid by the funding wallet and within the 5 USD cap.
    const spent = fundingUsdcBefore - balance(USDC, FUNDING);
    expect(spent).toBeGreaterThan(400_000n);
    expect(spent).toBeLessThan(600_000n);
  }, 90_000);

  it("tops a sale up to the exact quoted USDC when the pool fills 0.5% short", async () => {
    const x = await setup(RampDirection.SELL, { fillBps: 9_950n });
    const fundingUsdcBefore = balance(USDC, FUNDING);
    await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
    const final = await settle(x.rampId);
    expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");

    expect(balance(USDC, x.owner.address)).toBe(parseUnits(x.quote.outputAmount, 6));
    const subsidies = await Subsidy.findAll({ where: { rampId: x.rampId } });
    expect(subsidies.map(subsidy => [subsidy.phase, subsidy.token])).toEqual([["subsidizePreSwap", "USDC"]]);
    // Exactly what the pool fell short by: 0.5% of the 100 USDC the gold was quoted at.
    expect(fundingUsdcBefore - balance(USDC, FUNDING)).toBe(500_000n);
  }, 90_000);

  it("pauses a sale for an operator, paying nothing, when the fill is short by more than the Gold cap", async () => {
    // 0.25 PAXG is quoted at 1,000 USDC, so the cap is the 5 USD floor. A fill 1% short misses by 10 USDC.
    const x = await setup(RampDirection.SELL, { fillBps: 9_900n, size: 10 });
    const fundingUsdcBefore = balance(USDC, FUNDING);
    await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
    const paused = await settle(x.rampId);

    expect(paused.currentPhase).toBe("subsidizePreSwap");
    expect(JSON.stringify(paused.errorLogs)).toMatch(/exceeds the Gold sale cap \$5\.000000/);
    expect(balance(USDC, FUNDING)).toBe(fundingUsdcBefore);
    expect(balance(USDC, x.owner.address)).toBe(0n);
    expect(await Subsidy.count({ where: { rampId: x.rampId } })).toBe(0);
  }, 90_000);

  it.each([
    [RampDirection.SELL, "subsidizePreSwap"],
    [RampDirection.BUY, "goldSettlementTopUp"]
  ])(
    "does not make a %s whole when the customer broadcast the presigned swap themselves",
    async (direction, phase) => {
      // The pool moves 3% against the order right after the approval. That is below the swap's soft minimum, so the
      // API holds the swap. The customer holds the same signed transaction and sends it anyway. The shortfall of
      // about 3 USD is within the 5 USD cap and is the pool's own, so nothing but the mark stops a top-up.
      const x = await setup(direction, { movesAfterApprovalBps: 9_700n });
      const fundingUsdcBefore = balance(USDC, FUNDING);
      await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
      const held = await settle(x.rampId);
      expect(held.currentPhase).toBe("uniswapSwap");
      expect(JSON.stringify(held.errorLogs)).toMatch(/soft minimum/);

      const client = world.evm.getClient(Networks.Base) as {
        sendRawTransaction(args: { serializedTransaction: string }): Promise<string>;
      };
      await client.sendRawTransaction({ serializedTransaction: x.presignedSwap });
      await phaseProcessor.processRamp(x.rampId);
      const paused = await settle(x.rampId);

      expect(paused.currentPhase as string).toBe(phase);
      expect(JSON.stringify(paused.errorLogs)).toMatch(/not broadcast by the API/);
      expect(balance(USDC, FUNDING)).toBe(fundingUsdcBefore);
      expect(await Subsidy.count({ where: { rampId: x.rampId } })).toBe(0);
    },
    90_000
  );

  it.each([
    [RampDirection.SELL, "subsidizePreSwap", 1_000_000n],
    [RampDirection.BUY, "goldSettlementTopUp", 100_000_000_000_000n]
  ])(
    "does not replace what left the ephemeral of a %s by a transfer the flow did not sign",
    async (direction, phase, leakRaw) => {
      // Whoever holds the ephemeral's key can move its tokens with a signed authorization, without a transaction of
      // the ephemeral's own. The pool filled 0.5% short, which alone would be topped up.
      const x = await setup(direction, { fillBps: 9_950n, leakRaw });
      const fundingUsdcBefore = balance(USDC, FUNDING);
      await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
      const paused = await settle(x.rampId);

      expect(paused.currentPhase as string).toBe(phase);
      expect(JSON.stringify(paused.errorLogs)).toMatch(/funds left the ephemeral another way/);
      expect(balance(USDC, FUNDING)).toBe(fundingUsdcBefore);
      expect(await Subsidy.count({ where: { rampId: x.rampId } })).toBe(0);
    },
    90_000
  );
});
