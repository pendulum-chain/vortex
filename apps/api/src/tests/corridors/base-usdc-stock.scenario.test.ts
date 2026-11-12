import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EvmToken,
  Networks,
  RampDirection,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  signUnsignedTransactions,
  type PresignedTx,
  type SignedTypedData,
  type UnsignedTx
} from "@vortexfi/shared";
import { TypedDataEncoder } from "ethers";
import { decodeFunctionData, parseAbi, parseEther, parseSignature, parseUnits, parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { getBlockMetadata, getBlockState } from "../../api/services/phases/blocks/core/metadata";
import { ROBINHOOD_STOCKS } from "../../api/services/phases/blocks/core/robinhood-stocks";
import {
  StockRouteContext,
  type StockRouteState
} from "../../api/services/phases/blocks/phases/stock-route/simulation";
import phaseProcessor from "../../api/services/phases/phase-processor";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import { up as seedStocks } from "../../database/migrations/089-add-stocks-partner";
import { up as seedUsdc } from "../../database/migrations/090-add-stocks-usdc-pricing";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { setupTestDatabase, resetTestDatabase } from "../../test-utils/db";
import { createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { installFakeWorld, installFakeChainIdRpc, type FakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { scriptRobinhoodChain, TokenLedger } from "../../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const USDC = RELAY_BASE_USDC_ADDRESS,
  USDG = RELAY_ROBINHOOD_USDG_ADDRESS,
  STOCK = ROBINHOOD_STOCKS.NVDA.address;
const PAYOUT = "0x000000000000000000000000000000000000fee5";
const depositAbi = parseAbi(["function depositErc20(address depositor,address token,uint256 amount,bytes32 id)"]);

describe("Base-USDC stocks: real executors, simulated chain/providers", () => {
  let world: FakeWorld, app: TestApp, auth: { restore(): void }, restoreRpc: () => void;
  const enabled = config.stocks.usdcEnabledDirections;
  beforeAll(async () => {
    world = installFakeWorld();
    restoreRpc = installFakeChainIdRpc();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    config.stocks.usdcEnabledDirections = enabled;
    await app?.close();
    auth?.restore();
    restoreRpc?.();
    world?.restore();
  });
  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocks(sequelize.getQueryInterface());
    await seedUsdc(sequelize.getQueryInterface());
    for (const d of [RampDirection.BUY, RampDirection.SELL])
      await updatePartnerPricing("vortex", d, { payoutAddressEvm: PAYOUT });
    config.stocks.usdcEnabledDirections = [RampDirection.BUY, RampDirection.SELL];
    world.evm.strictReceipts = true;
    world.evm.sentTransactions.length = 0;
    world.evm.revertedReceiptHashes.clear();
    world.evm.onTransaction = undefined;
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setFeeEstimate(Networks.Robinhood, 30_000_000n, 0n);
    for (const network of [Networks.Base, Networks.Robinhood] as const)
      world.evm.setNativeBalance(network, getEvmFundingAccount(network).address, parseEther("10"));
    world.evm.setErc20Balance(Networks.Base, USDC, getEvmFundingAccount(Networks.Base).address, parseUnits("10000", 6));
    world.relay.statusRequests.length = 0;
    world.relay.statusScript.length = 0;
    world.relay.onStatusPoll = undefined;
    world.relay.feeBps = 6n;
    world.relay.finalStatus = {
      status: "success",
      inTxHashes: [`0x${"aa".repeat(32)}`],
      txHashes: [`0x${"bb".repeat(32)}`]
    };
    world.evm.onReadContract = (network, p) => {
      if (network !== Networks.Base || p.address.toLowerCase() !== USDC.toLowerCase()) return undefined;
      if (p.functionName === "name") return "USD Coin";
      if (p.functionName === "version") return "2";
      if (p.functionName === "DOMAIN_SEPARATOR")
        return TypedDataEncoder.hashDomain({ name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC });
      return undefined;
    };
    scriptRobinhoodChain(world.evm, 181n);
  });
  async function post(path: string, body: unknown, userId?: string) {
    const r = await app.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { Authorization: `Bearer ${testUserToken(userId)}` } : {})
      },
      body: JSON.stringify(body)
    });
    expect(r.status, `${path}: ${await r.clone().text()}`).toBeLessThan(300);
    return r.json();
  }
  async function setup(direction: RampDirection, { funded = true, refund = false, late = false } = {}) {
    const owner = privateKeyToAccount(generatePrivateKey()),
      secret = generatePrivateKey(),
      ephemeral = privateKeyToAccount(secret),
      user = await createTestUser();
    const amount = direction === RampDirection.BUY ? "1000" : "1",
      raw = direction === RampDirection.BUY ? parseUnits(amount, 6) : parseUnits(amount, 18);
    const sourceNetwork = direction === RampDirection.BUY ? Networks.Base : Networks.Robinhood,
      sourceToken = direction === RampDirection.BUY ? USDC : STOCK;
    world.evm.setNativeBalance(Networks.Base, owner.address, 0n);
    world.evm.setNativeBalance(Networks.Robinhood, owner.address, 0n);
    world.evm.setErc20Balance(sourceNetwork, sourceToken, owner.address, funded ? raw : 0n);
    const q = await post("/v1/quotes", {
      rampType: direction,
      from: direction === RampDirection.BUY ? Networks.Base : Networks.Robinhood,
      to: direction === RampDirection.BUY ? Networks.Robinhood : Networks.Base,
      network: Networks.Robinhood,
      inputCurrency: direction === RampDirection.BUY ? EvmToken.USDC : EvmToken.NVDA,
      outputCurrency: direction === RampDirection.BUY ? EvmToken.NVDA : EvmToken.USDC,
      inputAmount: amount,
      destinationAddress: owner.address
    });
    const registered = await post(
      "/v1/ramp/register",
      {
        quoteId: q.id,
        signingAccounts: [{ type: "EVM", address: ephemeral.address }],
        additionalData: { walletAddress: owner.address, destinationAddress: owner.address }
      },
      user.id
    );
    expect(
      registered.unsignedTxs.every((t: UnsignedTx) => t.signer.toLowerCase() === ephemeral.address.toLowerCase())
    ).toBe(true);
    const signed = await signUnsignedTransactions(registered.unsignedTxs, {
      evmEphemeral: { address: ephemeral.address, secret }
    });
    const byPhase = new Map(signed.map((t) => [t.phase, t.txData]));
    const ticket = (await QuoteTicket.findByPk(q.id))!;
    const route = getBlockMetadata(ticket.metadata, StockRouteContext);
    const ramp = (await RampState.findByPk(registered.id))!;
    const deposit = getBlockState<StockRouteState>(ramp.state, StockRouteContext).relayDepositAddress as `0x${string}`;
    const ledger = new TokenLedger(world.evm, 181n, ephemeral.address, {
      [USDC.toLowerCase()]: { name: "USD Coin", version: "2" }
    });
    let bridgeDepositRaw = 0n,
      refundExpectedBalance = 0n;
    const fill = () => {
      if (direction === RampDirection.BUY)
        ledger.credit(Networks.Robinhood, USDG, ephemeral.address, BigInt(route.bridge.outputAmountRaw));
      else
        ledger.credit(
          Networks.Base,
          USDC,
          ephemeral.address,
          (bridgeDepositRaw * (10000n - world.relay.feeBps)) / 10000n
        );
    };
    if (late) {
      world.relay.statusScript.push({ status: "pending" });
      world.relay.onStatusPoll = (poll) => {
        if (poll === 2) fill();
      };
    }
    const refundNetwork = direction === RampDirection.BUY ? Networks.Base : Networks.Robinhood;
    const refundToken = direction === RampDirection.BUY ? USDC : USDG;
    let refundedRaw = 0n;
    if (refund) {
      world.relay.finalStatus = { status: "refund", inTxHashes: [], txHashes: [] };
      world.relay.onStatusPoll = (poll) => {
        if (poll !== 1) return;
        const holder = direction === RampDirection.BUY ? RELAY_DEPOSITORY_ADDRESS : deposit;
        refundedRaw = bridgeDepositRaw;
        world.evm.setErc20Balance(
          refundNetwork,
          refundToken,
          holder,
          world.evm.erc20Balance(refundNetwork, refundToken, holder) - refundedRaw
        );
        ledger.credit(refundNetwork, refundToken, ephemeral.address, refundedRaw);
        refundExpectedBalance = world.evm.erc20Balance(refundNetwork, refundToken, ephemeral.address);
      };
    }
    world.evm.onTransaction = (tx) => {
      const beforeDeposit =
        direction === RampDirection.SELL ? world.evm.erc20Balance(Networks.Robinhood, USDG, deposit) : 0n;
      ledger.apply(tx);
      const paid =
        direction === RampDirection.BUY
          ? tx.serialized === byPhase.get("relayBridge")
          : tx.serialized === byPhase.get("uniswapSwap");
      if (direction === RampDirection.BUY && tx.serialized === byPhase.get("relayBridge")) {
        const { args } = decodeFunctionData({
          abi: depositAbi,
          data: parseTransaction(tx.serialized as `0x${string}`).data!
        });
        bridgeDepositRaw = args![2];
        ledger.pull(tx, USDC, ephemeral.address, RELAY_DEPOSITORY_ADDRESS, RELAY_DEPOSITORY_ADDRESS, bridgeDepositRaw);
      }
      if (paid && direction === RampDirection.SELL)
        bridgeDepositRaw = world.evm.erc20Balance(Networks.Robinhood, USDG, deposit) - beforeDeposit;
      if (paid && !refund && !late) fill();
    };
    const updated = await post("/v1/ramp/update", { rampId: registered.id, presignedTxs: signed }, user.id);
    const permit = updated.unsignedTxs.find((t: UnsignedTx) => t.signer.toLowerCase() === owner.address.toLowerCase());
    expect(permit.network).toBe(sourceNetwork);
    const payload = permit.txData as SignedTypedData;
    const signature = await owner.signTypedData(payload as Parameters<typeof owner.signTypedData>[0]);
    const { r, s, v } = parseSignature(signature);
    const authorization = {
      ...permit,
      txData: [{ ...payload, signature: { deadline: Number(payload.message.deadline), r, s, v: Number(v) } }]
    } as PresignedTx;
    await post("/v1/ramp/update", { rampId: registered.id, presignedTxs: [authorization] }, user.id);
    return {
      q,
      rampId: registered.id,
      userId: user.id,
      owner,
      ephemeral,
      sourceNetwork,
      sourceToken,
      raw,
      byPhase,
      refundNetwork,
      refundToken,
      refundedRaw: () => refundedRaw,
      refundExpectedBalance: () => refundExpectedBalance
    };
  }
  async function settle(rampId: string) {
    const until = Date.now() + 60000;
    for (;;) {
      const r = (await RampState.findByPk(rampId))!;
      if (r.currentPhase !== "initial" && !r.processingLock.locked) return r;
      if (Date.now() > until) throw new Error(`stuck ${r.currentPhase}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  it.each([RampDirection.BUY, RampDirection.SELL])(
    "completes %s without customer ETH or fiat onboarding, and is idempotent",
    async (direction) => {
      const x = await setup(direction);
      await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
      const final = await settle(x.rampId);
      expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");
      const outputNetwork = direction === RampDirection.BUY ? Networks.Robinhood : Networks.Base,
        outputToken = direction === RampDirection.BUY ? STOCK : USDC;
      expect(world.evm.erc20Balance(outputNetwork, outputToken, x.owner.address)).toBe(
        parseUnits(x.q.outputAmount, direction === RampDirection.BUY ? 18 : 6)
      );
      expect(world.evm.erc20Balance(x.sourceNetwork, x.sourceToken, x.owner.address)).toBe(0n);
      expect(world.brla.pixInputTickets).toHaveLength(0);
      expect(world.brla.pixOutputTickets).toHaveLength(0);
      const count = world.evm.sentTransactions.length;
      await phaseProcessor.processRamp(x.rampId);
      expect(world.evm.sentTransactions).toHaveLength(count);
    },
    60000
  );
  it("waits for a partial USDC balance before spending any sponsored gas, then resumes once", async () => {
    const x = await setup(RampDirection.BUY, { funded: false });
    world.evm.setErc20Balance(Networks.Base, USDC, x.owner.address, x.raw / 2n);
    await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
    const paused = await settle(x.rampId);
    expect(paused.currentPhase).toBe("fundEphemeral");
    expect(world.evm.sentTransactions).toHaveLength(0);
    world.evm.setErc20Balance(Networks.Base, USDC, x.owner.address, x.raw);
    await phaseProcessor.processRamp(x.rampId);
    const final = (await RampState.findByPk(x.rampId))!;
    expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");
  }, 60000);
  it.each([RampDirection.BUY, RampDirection.SELL])(
    "pauses a refunded %s for reconciliation without duplicate source pulls",
    async (direction) => {
      const x = await setup(direction, { refund: true });
      await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
      const final = await settle(x.rampId);
      expect(final.currentPhase).toBe("relayBridge");
      expect(JSON.stringify(final.errorLogs)).toMatch(/reconciliation|refund/);
      expect(x.refundedRaw()).toBeGreaterThan(0n);
      expect(world.evm.erc20Balance(x.refundNetwork, x.refundToken, x.ephemeral.address)).toBe(
        x.refundExpectedBalance()
      );
      const sourcePull = x.byPhase.get("stockPermitTransfer"),
        count = world.evm.sentTransactions.filter((t) => t.serialized === sourcePull).length;
      await phaseProcessor.processRamp(x.rampId);
      expect(world.evm.sentTransactions.filter((t) => t.serialized === sourcePull)).toHaveLength(count);
      expect(world.evm.erc20Balance(x.refundNetwork, x.refundToken, x.ephemeral.address)).toBe(
        x.refundExpectedBalance()
      );
    },
    60000
  );
  it("accepts a late bridge fill without repeating the permit or deposit", async () => {
    const x = await setup(RampDirection.BUY, { late: true });
    await post("/v1/ramp/start", { rampId: x.rampId }, x.userId);
    const final = await settle(x.rampId);
    expect(final.currentPhase, JSON.stringify(final.errorLogs)).toBe("complete");
    expect(world.relay.statusRequests.length).toBeGreaterThanOrEqual(2);
    expect(world.evm.sentTransactions.filter((t) => t.serialized === x.byPhase.get("relayBridge"))).toHaveLength(1);
  }, 60000);
});
