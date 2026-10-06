import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as shared from "@vortexfi/shared";
import {
  AveniaTicketStatus,
  type EvmTokenDetails,
  type EvmTransactionData,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  NATIVE_TOKEN_ADDRESS,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  RampDirection,
  type RampPhase,
  TokenType,
  type UnsignedTx
} from "@vortexfi/shared";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import rampService from "../../api/services/ramp/ramp.service";
import RampRecoveryWorker from "../../api/workers/ramp-recovery.worker";
import { getFlowMetadata } from "../../api/services/phases/blocks/core/metadata";
import { resolvePersistedBlockFlow } from "../../api/services/phases/blocks/flows/catalog";
import { assertPersistedBlockFlowVersionsSupported } from "../../api/services/phases/blocks/register-handlers";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireToken(network: Networks.Base | Networks.Polygon, token: EvmToken) {
  const details = evmTokenConfig[network][token];
  if (!details) {
    throw new Error(`${token} token config missing for ${network}`);
  }
  return details;
}
const USDC_ON_BASE = requireToken(Networks.Base, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const USDC_ON_POLYGON = requireToken(Networks.Polygon, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const BRLA_ON_BASE = requireToken(Networks.Base, EvmToken.BRLA).erc20AddressSourceChain as `0x${string}`;

const TAX_ID = "12345678901";
// FakeBrla.validatePixKey reports this as the pix key owner's tax id; the
// registration-time receiver check must be given a matching value.
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";

// Identical to the Base→Base swap corridor: the squidRouterApprove/Swap leg is
// user-broadcast on Polygon before the processor runs, so it never appears in
// the processor's phase history.
const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase",
  "complete"
];

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  userWallet: PrivateKeyAccount;
  ephemeral: PrivateKeyAccount;
  /** Raw (6-decimal) USDC amount the Nabla swap consumes on Base. */
  swapInputRaw: bigint;
  /** Raw (18-decimal) BRLA amount the swap yields and the payout transfers. */
  swapOutputRaw: bigint;
  signedNablaSwap: `0x${string}`;
  signedPayout: `0x${string}`;
  approveBlueprint: UnsignedTx;
  swapBlueprint: UnsignedTx;
  /** Hash of the user's broadcast squidRouterApprove on Polygon. */
  approveHash: `0x${string}`;
  /** Hash of the user's broadcast squidRouterSwap on Polygon. */
  swapHash: `0x${string}`;
  userId: string;
}

/**
 * Corridor scenario tests for the CROSS-CHAIN BRL offramp path (USDC on
 * Polygon → SquidRouter → USDC on Base → Nabla swap → pix via Avenia). This is
 * the branch of prepareEvmToBRLOfframpBaseTransactions the Base→Base corridor
 * never reaches: registration must issue squidRouterApprove + squidRouterSwap
 * blueprints for the user's wallet on the source chain, and fundEphemeral must
 * verify the user-reported hashes against those blueprints before any
 * ephemeral funds are spent (F-021/F-038 class).
 */
describe("BRL offramp cross-chain corridor (USDC on Polygon → Base → pix via Avenia)", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    auth?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    // The EVM fee distribution transaction builder requires the vortex
    // partner's EVM payout address even when the resulting fees are zero.
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" });
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.brla.payoutTicketStatus = AveniaTicketStatus.PAID;
    // Fresh subaccount wallet per test: the in-memory EVM ledger persists
    // across tests, so a shared payout recipient would accumulate balances.
    world.brla.subaccountEvmWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // Both the quote pipeline's bridge estimate and the registration-time
    // squid transactions route Polygon USDC → Base USDC: the fake route's
    // destination token must report USDC's 6 decimals.
    world.squidRouter.toTokenDecimals = 6;
    // Deterministic Nabla quoter for USDC (6 decimals) → BRLA (18 decimals)
    // at a flat 5 BRLA per USDC, matching the FakePrices 5 BRL/USD feed.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return amountIn * 5n * 10n ** 12n;
      }
      return undefined;
    };
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Polygon,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Polygon,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; outputAmount: string };
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    ephemeral: PrivateKeyAccount,
    userWallet: PrivateKeyAccount
  ): Promise<{ id: string }> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: {
          pixDestination: PIX_KEY,
          receiverTaxId: RECEIVER_TAX_ID,
          taxId: TAX_ID,
          walletAddress: userWallet.address
        },
        quoteId,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  function blueprintOf(unsignedTxs: UnsignedTx[], phase: RampPhase): UnsignedTx {
    const blueprint = unsignedTxs.find(tx => tx.phase === phase);
    expect(blueprint, `missing ${phase} blueprint in persisted ramp state`).toBeDefined();
    return blueprint as UnsignedTx;
  }

  async function signBlueprint(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx): Promise<`0x${string}`> {
    const txData = blueprint.txData as EvmTransactionData;
    return ephemeral.signTransaction({
      chainId: 8453,
      data: txData.data as `0x${string}`,
      gas: BigInt(txData.gas),
      maxFeePerGas: BigInt(txData.maxFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
      maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
      nonce: blueprint.nonce,
      to: txData.to as `0x${string}`,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
  }

  /**
   * Signs a blueprint plus the four required same-call backups at the following
   * nonces, shaped for /v1/ramp/update.
   */
  async function signBlueprintWithBackups(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx) {
    const additionalTxs: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      additionalTxs[`${blueprint.phase}${i}`] = {
        nonce: blueprint.nonce + i,
        txData: await signBlueprint(ephemeral, { ...blueprint, nonce: blueprint.nonce + i })
      };
    }
    return {
      meta: { additionalTxs },
      network: blueprint.network,
      nonce: blueprint.nonce,
      phase: blueprint.phase,
      signer: ephemeral.address,
      txData: await signBlueprint(ephemeral, blueprint)
    };
  }

  /** Broadcasts a user-wallet blueprint on its source chain exactly as issued. */
  function broadcastUserBlueprint(userWallet: PrivateKeyAccount, blueprint: UnsignedTx): `0x${string}` {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    return world.evm.broadcastUserTransaction(blueprint.network, userWallet.address, {
      data: txData.data,
      to: txData.to,
      value: BigInt(txData.value ?? "0")
    });
  }

  /**
   * Creates quote + registration through the HTTP API, broadcasts the user's
   * squidRouterApprove + squidRouterSwap on Polygon, and stores their hashes
   * plus the ephemeral's presigned Base-side transactions the way the
   * frontend/SDK would via /v1/ramp/update.
   */
  async function setUpRegisteredRamp(options: { reportHashes?: boolean; viaApi?: boolean } = {}): Promise<CorridorSetup> {
    const reportHashes = options.reportHashes ?? true;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, userWallet);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const blocks = getFlowMetadata(persistedQuote?.metadata).blocks;
    const swapInputRaw = BigInt((blocks.nablaSwap as { inputAmountForSwapRaw: string }).inputAmountForSwapRaw);
    const swapOutputRaw = BigInt((blocks.aveniaOfframpPayout as { transferAmountRaw: string }).transferAmountRaw);
    expect(swapInputRaw).toBeGreaterThan(0n);
    expect(swapOutputRaw).toBeGreaterThan(0n);

    const rampState = await RampState.findByPk(ramp.id);
    if (!rampState) {
      throw new Error("Ramp state not found after registration");
    }
    const unsignedTxs = rampState.unsignedTxs ?? [];

    // The cross-chain branch: user-wallet squid transactions on the source
    // chain instead of the Base-direct squidRouterNoPermitTransfer.
    expect(unsignedTxs.some(tx => tx.phase === "squidRouterNoPermitTransfer")).toBe(false);
    const approveBlueprint = blueprintOf(unsignedTxs, "squidRouterApprove");
    const swapBlueprint = blueprintOf(unsignedTxs, "squidRouterSwap");

    const nablaApproveBlueprint = blueprintOf(unsignedTxs, "nablaApprove");
    const nablaSwapBlueprint = blueprintOf(unsignedTxs, "nablaSwap");
    const payoutBlueprint = blueprintOf(unsignedTxs, "brlaPayoutOnBase");

    const signedNablaApprove = await signBlueprint(ephemeral, nablaApproveBlueprint);
    const signedNablaSwap = await signBlueprint(ephemeral, nablaSwapBlueprint);
    const signedPayout = await signBlueprint(ephemeral, payoutBlueprint);

    const presign = (blueprint: UnsignedTx, txData: `0x${string}`) => ({
      meta: {},
      network: blueprint.network,
      nonce: blueprint.nonce,
      phase: blueprint.phase,
      signer: ephemeral.address,
      txData
    });

    const approveHash = broadcastUserBlueprint(userWallet, approveBlueprint);
    const swapHash = broadcastUserBlueprint(userWallet, swapBlueprint);

    let effectiveSignedNablaSwap = signedNablaSwap;
    let effectiveSignedPayout = signedPayout;
    if (options.viaApi) {
      // Full API flow: sign EVERY ephemeral blueprint (with the required backups) and submit
      // through /v1/ramp/update, so the later /v1/ramp/start validation sees a complete set.
      const apiPresignedTxs = [];
      for (const blueprint of unsignedTxs.filter(tx => tx.signer.toLowerCase() === ephemeral.address.toLowerCase())) {
        apiPresignedTxs.push(await signBlueprintWithBackups(ephemeral, blueprint));
      }
      effectiveSignedNablaSwap = apiPresignedTxs.find(tx => tx.phase === "nablaSwap")?.txData as `0x${string}`;
      effectiveSignedPayout = apiPresignedTxs.find(tx => tx.phase === "brlaPayoutOnBase")?.txData as `0x${string}`;
      const updateResponse = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          additionalData: reportHashes ? { squidRouterApproveHash: approveHash, squidRouterSwapHash: swapHash } : {},
          presignedTxs: apiPresignedTxs,
          rampId: ramp.id
        }),
        headers: { Authorization: `Bearer ${testUserToken(user.id)}`, "Content-Type": "application/json" },
        method: "POST"
      });
      expect(updateResponse.status).toBe(200);
    } else {
      await rampState.update({
        presignedTxs: [
          presign(nablaApproveBlueprint, signedNablaApprove),
          presign(nablaSwapBlueprint, signedNablaSwap),
          presign(payoutBlueprint, signedPayout)
        ],
        state: reportHashes
          ? { ...rampState.state, squidRouterApproveHash: approveHash, squidRouterSwapHash: swapHash }
          : rampState.state
      });
    }

    return {
      approveBlueprint,
      approveHash,
      ephemeral,
      quoteId: quote.id,
      rampId: ramp.id,
      signedNablaSwap: effectiveSignedNablaSwap,
      signedPayout: effectiveSignedPayout,
      swapBlueprint,
      swapHash,
      swapInputRaw,
      swapOutputRaw,
      userId: user.id,
      userWallet
    };
  }

  /**
   * Scripts the fake world for the happy path: the ephemeral has Base gas, the
   * squid-bridged USDC has already landed on Base, and broadcast transactions
   * apply their ledger effects (Nabla swap credit + raw ERC-20 transfers).
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address, setup.swapInputRaw);
    world.evm.onTransaction = tx => {
      if (tx.serialized === setup.signedNablaSwap) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, setup.ephemeral.address, setup.swapOutputRaw);
        return;
      }
      if (tx.serialized === setup.signedPayout) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet, setup.swapOutputRaw);
      }
    };
  }

  function submissionsOf(signedTransfer: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTransfer).length;
  }

  it(
    "happy path: registration issues source-chain squid blueprints and the corridor completes end to end",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const pixOutBefore = world.brla.pixOutputTickets.length;

      // Registration requested a Polygon USDC → Base USDC squid route for the
      // user's wallet, delivering to the ephemeral.
      expect(setup.approveBlueprint.network).toBe(Networks.Polygon);
      expect(setup.swapBlueprint.network).toBe(Networks.Polygon);
      expect(setup.approveBlueprint.signer.toLowerCase()).toBe(setup.userWallet.address.toLowerCase());
      expect(setup.swapBlueprint.signer.toLowerCase()).toBe(setup.userWallet.address.toLowerCase());
      const approveTxData = setup.approveBlueprint.txData as unknown as { to: string };
      expect(approveTxData.to.toLowerCase()).toBe(USDC_ON_POLYGON.toLowerCase());
      const registrationRoute = world.squidRouter.requestedRoutes.find(
        route =>
          route.fromToken.toLowerCase() === USDC_ON_POLYGON.toLowerCase() &&
          route.toToken.toLowerCase() === USDC_ON_BASE.toLowerCase() &&
          route.toAddress?.toLowerCase() === setup.ephemeral.address.toLowerCase()
      );
      expect(registrationRoute, "registration should request a Polygon→Base USDC route to the ephemeral").toBeDefined();
      expect(registrationRoute?.fromChain).toBe("137");
      expect(registrationRoute?.toChain).toBe("8453");
      expect(registrationRoute?.fromAddress.toLowerCase()).toBe(setup.userWallet.address.toLowerCase());

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(submissionsOf(setup.signedNablaSwap)).toBe(1);
      expect(submissionsOf(setup.signedPayout)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
      expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
    },
    30000
  );

  it(
    "recoverable pause: with no reported squid hashes the ramp waits in fundEphemeral and resumes once they arrive",
    async () => {
      const setup = await setUpRegisteredRamp({ reportHashes: false });
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      // The user has not (yet) broadcast/reported the squid leg: the processor
      // must park the ramp recoverably without spending ephemeral funds.
      const paused = await RampState.findByPk(setup.rampId);
      expect(paused?.currentPhase).toBe("fundEphemeral");
      expect(paused?.processingLock).toEqual({ locked: false, lockedAt: null });
      const waitLogs = paused?.errorLogs.filter(log => log.error.includes("hash not yet reported")) ?? [];
      expect(waitLogs.length).toBeGreaterThanOrEqual(1);
      expect(waitLogs.every(log => log.recoverable === true)).toBe(true);
      expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);

      // The hashes arrive (the frontend reports them) and processing resumes.
      await paused?.update({
        state: { ...paused.state, squidRouterApproveHash: setup.approveHash, squidRouterSwapHash: setup.swapHash }
      });
      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
    },
    60000
  );

  it(
    "pre-existing allowance: the ramp completes when only the swap hash is reported (no approve hash)",
    async () => {
      const setup = await setUpRegisteredRamp({ reportHashes: false });
      scriptHappyWorld(setup);

      // The user's wallet already held a sufficient allowance for the squid
      // router, so no approve tx was submitted — only the swap hash arrives.
      const rampState = await RampState.findByPk(setup.rampId);
      await rampState?.update({
        state: { ...rampState?.state, squidRouterSwapHash: setup.swapHash }
      });

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
    },
    30000
  );

  it(
    "security: a reported approve hash whose calldata differs from the blueprint still fails the ramp",
    async () => {
      const setup = await setUpRegisteredRamp({ reportHashes: false });
      scriptHappyWorld(setup);

      // The approve hash is optional, but when one IS reported it must still
      // match the blueprint — relaxing the presence check must not disable
      // content verification.
      const approveTxData = setup.approveBlueprint.txData as unknown as { to: `0x${string}`; value?: string };
      const tamperedHash = world.evm.broadcastUserTransaction(Networks.Polygon, setup.userWallet.address, {
        data: "0xdeadbeef",
        to: approveTxData.to,
        value: BigInt(approveTxData.value ?? "0")
      });
      const rampState = await RampState.findByPk(setup.rampId);
      await rampState?.update({
        state: { ...rampState?.state, squidRouterApproveHash: tamperedHash, squidRouterSwapHash: setup.swapHash }
      });

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("calldata does not match"))).toBe(true);
      expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
    },
    30000
  );

  it(
    "security regression (F-021 class): a reported swap hash whose calldata differs from the blueprint fails the ramp",
    async () => {
      const setup = await setUpRegisteredRamp({ reportHashes: false });
      scriptHappyWorld(setup);

      // The attacker points us at a REAL Polygon tx from the right wallet to
      // the right router — but with different calldata (e.g. a swap that pays
      // them instead of the ephemeral).
      const swapTxData = setup.swapBlueprint.txData as unknown as { to: `0x${string}`; value?: string };
      const tamperedHash = world.evm.broadcastUserTransaction(Networks.Polygon, setup.userWallet.address, {
        data: "0xdeadbeef",
        to: swapTxData.to,
        value: BigInt(swapTxData.value ?? "0")
      });
      const rampState = await RampState.findByPk(setup.rampId);
      await rampState?.update({
        state: { ...rampState.state, squidRouterApproveHash: setup.approveHash, squidRouterSwapHash: tamperedHash }
      });

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("calldata does not match"))).toBe(true);

      // No ephemeral funds moved: the swap and payout never reached the chain.
      expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
    },
    30000
  );

  describe("recovery worker starts funded SELL ramps the client never started", () => {
    const MINUTE = 60 * 1000;
    let startSpy: ReturnType<typeof spyOn<typeof rampService, "recoverFundedSellRamp">>;

    beforeEach(() => {
      startSpy = spyOn(rampService, "recoverFundedSellRamp");
    });

    afterEach(() => {
      startSpy.mockRestore();
    });

    async function backdate(rampId: string, ageMs: number): Promise<void> {
      await RampState.update({ createdAt: new Date(Date.now() - ageMs) }, { where: { id: rampId } });
    }

    async function runRecoveryWorker(): Promise<void> {
      const worker = new RampRecoveryWorker("*/5 * * * *", false) as unknown as { recover: () => Promise<void> };
      await worker.recover();
    }

    async function waitForPhase(rampId: string, phase: RampPhase): Promise<RampState> {
      const deadline = Date.now() + 20000;
      for (;;) {
        const ramp = await RampState.findByPk(rampId);
        if (ramp?.currentPhase === phase) {
          return ramp;
        }
        if (Date.now() > deadline) {
          throw new Error(`Ramp ${rampId} did not reach ${phase}; stuck in ${ramp?.currentPhase}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // The worker's only way to start a ramp is recoverFundedSellRamp, and a started ramp advances
    // asynchronously, so the spy (not the persisted phase alone) proves nothing was started.
    async function expectStillInitialAndUntouched(setup: CorridorSetup): Promise<void> {
      expect(startSpy).not.toHaveBeenCalled();
      const ramp = await RampState.findByPk(setup.rampId);
      expect(ramp?.currentPhase).toBe("initial");
      expect(ramp?.errorLogs).toEqual([]);
      expect(ramp?.phaseHistory.map(entry => entry.phase)).toEqual(["initial"]);
      expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);
    }

    it(
      "starts and completes a ramp whose hash was reported inside the window but was never started",
      async () => {
        const setup = await setUpRegisteredRamp({ viaApi: true });
        scriptHappyWorld(setup);
        const pixOutBefore = world.brla.pixOutputTickets.length;
        await backdate(setup.rampId, 17 * MINUTE);

        await runRecoveryWorker();

        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(startSpy).toHaveBeenCalledWith(setup.rampId);
        const final = await waitForPhase(setup.rampId, "complete");
        expect(final.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
        expect(submissionsOf(setup.signedNablaSwap)).toBe(1);
        expect(submissionsOf(setup.signedPayout)).toBe(1);
        expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
        expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
      },
      60000
    );

    it("keeps the public start and update strict: both still reject the same ramp with 400 after the deadline", async () => {
      const setup = await setUpRegisteredRamp({ viaApi: true });
      await backdate(setup.rampId, 17 * MINUTE);
      const headers = { Authorization: `Bearer ${testUserToken(setup.userId)}`, "Content-Type": "application/json" };

      const start = await app.request("/v1/ramp/start", {
        body: JSON.stringify({ rampId: setup.rampId }),
        headers,
        method: "POST"
      });
      const update = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          additionalData: { squidRouterSwapHash: setup.swapHash },
          presignedTxs: [],
          rampId: setup.rampId
        }),
        headers,
        method: "POST"
      });

      expect(start.status).toBe(400);
      expect(await start.text()).toContain("Maximum time window to start process exceeded");
      expect(update.status).toBe(400);
      expect(await update.text()).toContain("Maximum time window to start process exceeded");
      await expectStillInitialAndUntouched(setup);
    });

    it("leaves a ramp whose source hash was never reported initial", async () => {
      const setup = await setUpRegisteredRamp({ reportHashes: false, viaApi: true });
      scriptHappyWorld(setup);
      await backdate(setup.rampId, 17 * MINUTE);

      await runRecoveryWorker();

      await expectStillInitialAndUntouched(setup);
    });

    for (const ageMinutes of [14, 15.5]) {
      it(`leaves a ramp untouched while the public start window or its one-minute grace is open (${ageMinutes} min)`, async () => {
        const setup = await setUpRegisteredRamp({ viaApi: true });
        scriptHappyWorld(setup);
        await backdate(setup.rampId, ageMinutes * MINUTE);

        await runRecoveryWorker();

        await expectStillInitialAndUntouched(setup);
      });
    }

    it("leaves a ramp older than the three-day recovery window untouched", async () => {
      const setup = await setUpRegisteredRamp({ viaApi: true });
      scriptHappyWorld(setup);
      await backdate(setup.rampId, 3 * 24 * 60 * MINUTE + 60 * MINUTE);

      await runRecoveryWorker();

      await expectStillInitialAndUntouched(setup);
    });

    it(
      "security: a reported hash whose calldata differs from the blueprint fails the started ramp before any spend",
      async () => {
        const setup = await setUpRegisteredRamp({ reportHashes: false, viaApi: true });
        scriptHappyWorld(setup);
        const swapTxData = setup.swapBlueprint.txData as unknown as { to: `0x${string}`; value?: string };
        const tamperedHash = world.evm.broadcastUserTransaction(Networks.Polygon, setup.userWallet.address, {
          data: "0xdeadbeef",
          to: swapTxData.to,
          value: BigInt(swapTxData.value ?? "0")
        });
        const rampState = await RampState.findByPk(setup.rampId);
        await rampState?.update({
          state: { ...rampState.state, squidRouterApproveHash: setup.approveHash, squidRouterSwapHash: tamperedHash }
        });
        await backdate(setup.rampId, 17 * MINUTE);

        await runRecoveryWorker();

        const final = await waitForPhase(setup.rampId, "failed");
        expect(final.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
        expect(final.errorLogs.some(log => log.error.includes("calldata does not match"))).toBe(true);
        expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
        expect(submissionsOf(setup.signedPayout)).toBe(0);
        expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
      },
      60000
    );
  });

  async function requestSellQuote(inputCurrency: string, inputAmount: string, network: Networks = Networks.Ethereum) {
    return app.request("/v1/quotes", {
      body: JSON.stringify({
        from: network,
        inputAmount,
        inputCurrency,
        network,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: "pix"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  }

  it("unknown SELL source token: the catalog maps the request and the flow input rejects it with 400", async () => {
    const response = await requestSellQuote("NOPE", "1");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("Token NOPE is not configured on ethereum");
  });

  it("restart compatibility: an active routed-token SELL ramp resolves when token discovery is static-only", async () => {
    // PAXG only exists in the Squid-discovered part of the token catalog. Discovery knows it while
    // the quote and ramp are created ...
    const realGetOnChainTokenDetails = shared.getOnChainTokenDetails;
    const routedPaxg: EvmTokenDetails = {
      assetSymbol: "PAXG",
      decimals: 18,
      erc20AddressSourceChain: "0x45804880de22913dafe09f4980848ece6ecbaf78",
      isNative: false,
      network: Networks.Ethereum,
      pendulumRepresentative: requireToken(Networks.Base, EvmToken.USDC).pendulumRepresentative,
      type: TokenType.Evm
    };
    mock.module("@vortexfi/shared", () => ({
      ...shared,
      getOnChainTokenDetails: (network: Networks, token: string, ...rest: unknown[]) =>
        network === Networks.Ethereum && token === "PAXG"
          ? routedPaxg
          : (realGetOnChainTokenDetails as (...args: unknown[]) => unknown)(network, token, ...rest)
    }));
    const { computeToAmount, computeToAmountUsd } = world.squidRouter;
    world.squidRouter.computeToAmount = () => "50000000"; // 50 USDC on Base
    world.squidRouter.computeToAmountUsd = () => "50";
    try {
      const user = await createTestUser();
      await createTestTaxId(user.id, { taxId: TAX_ID });
      const response = await requestSellQuote("PAXG", "0.02");
      expect(response.status).toBe(201);
      const quote = (await response.json()) as { id: string };
      const ramp = await registerViaApi(
        quote.id,
        user.id,
        privateKeyToAccount(generatePrivateKey()),
        privateKeyToAccount(generatePrivateKey())
      );

      // ... then the API restarts while Squid's token list is unavailable, so discovery falls back
      // to the static config, which has no PAXG. Startup must still resolve the persisted flow.
      mock.module("@vortexfi/shared", () => ({ ...shared, getOnChainTokenDetails: realGetOnChainTokenDetails }));
      expect(realGetOnChainTokenDetails(Networks.Ethereum, "PAXG")).toBeUndefined();

      await assertPersistedBlockFlowVersionsSupported();
      const persistedQuote = await QuoteTicket.findByPk(quote.id);
      expect(resolvePersistedBlockFlow(persistedQuote?.metadata).name).toBe("BrlOfframpBase");
      const rampState = await RampState.findByPk(ramp.id);
      expect(rampState?.currentPhase).toBe("initial");
    } finally {
      mock.module("@vortexfi/shared", () => ({ ...shared, getOnChainTokenDetails: realGetOnChainTokenDetails }));
      Object.assign(world.squidRouter, { computeToAmount, computeToAmountUsd });
    }
  });

  it("native ETH source: the quote prices only the router fee as network fee, not the swapped principal", async () => {
    // Squid sends a native input as msg.value, so the route's value is the principal plus the
    // router fee. Pricing the whole value as network fee zeroed the swap input (regression).
    const routerFeeWei = 13_400_376_419_807n;
    const { transactionValueWei, computeToAmount, computeToAmountUsd } = world.squidRouter;
    world.squidRouter.transactionValueWei = (parseUnits("1", 18) + routerFeeWei).toString();
    world.squidRouter.computeToAmount = () => "2500000000"; // 2,500 USDC on Base
    world.squidRouter.computeToAmountUsd = () => "2500";
    try {
      const response = await app.request("/v1/quotes", {
        body: JSON.stringify({
          from: Networks.Ethereum,
          inputAmount: "1",
          inputCurrency: EvmToken.ETH,
          network: Networks.Ethereum,
          outputCurrency: FiatToken.BRL,
          rampType: RampDirection.SELL,
          to: "pix"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(201);
      const quote = (await response.json()) as { networkFeeUsd: string; outputAmount: string };
      // 13,400,376,419,807 wei at the FakePrices 2,500 USD/ETH feed.
      expect(Number(quote.networkFeeUsd)).toBeCloseTo(0.0335, 3);
      expect(Number(quote.outputAmount)).toBeGreaterThan(0);
    } finally {
      Object.assign(world.squidRouter, { computeToAmount, computeToAmountUsd, transactionValueWei });
    }
  });

  for (const { network, priceUsd, symbol, tokenId } of [
    { network: Networks.Avalanche, priceUsd: 25, symbol: "AVAX", tokenId: "avalanche-2" },
    { network: Networks.BSC, priceUsd: 600, symbol: "BNB", tokenId: "binancecoin" }
  ]) {
    it(`native ${symbol} source: a price-feed outage uses the Squid-discovered native-token price`, async () => {
      const realGetEvmTokensForNetwork = shared.getEvmTokensForNetwork;
      const realGetOnChainTokenDetails = shared.getOnChainTokenDetails;
      const nativeToken: EvmTokenDetails = {
        assetSymbol: symbol,
        decimals: 18,
        erc20AddressSourceChain: NATIVE_TOKEN_ADDRESS,
        isNative: true,
        network,
        pendulumRepresentative: requireToken(Networks.Base, EvmToken.USDC).pendulumRepresentative,
        type: TokenType.Evm,
        usdPrice: priceUsd
      };
      mock.module("@vortexfi/shared", () => ({
        ...shared,
        getEvmTokensForNetwork: (candidateNetwork: Networks, ...rest: unknown[]) =>
          candidateNetwork === network
            ? [nativeToken]
            : (realGetEvmTokensForNetwork as (...args: unknown[]) => unknown)(candidateNetwork, ...rest),
        getOnChainTokenDetails: (candidateNetwork: Networks, token: string, ...rest: unknown[]) =>
          candidateNetwork === network && token === symbol
            ? nativeToken
            : (realGetOnChainTokenDetails as (...args: unknown[]) => unknown)(candidateNetwork, token, ...rest)
      }));

      const routerFeeWei = 10_000_000_000_000_000n;
      const savedPrice = world.prices.cryptoUsd[tokenId];
      const { transactionValueWei, computeToAmount, computeToAmountUsd } = world.squidRouter;
      delete world.prices.cryptoUsd[tokenId];
      world.squidRouter.transactionValueWei = (parseUnits("1", 18) + routerFeeWei).toString();
      world.squidRouter.computeToAmount = () => "2500000000";
      world.squidRouter.computeToAmountUsd = () => "2500";

      try {
        const response = await requestSellQuote(symbol, "1", network);
        expect(response.status).toBe(201);
        const quote = (await response.json()) as { networkFeeUsd: string; outputAmount: string };
        expect(Number(quote.networkFeeUsd)).toBeCloseTo(Number(routerFeeWei) * 1e-18 * priceUsd, 6);
        expect(Number(quote.outputAmount)).toBeGreaterThan(0);
      } finally {
        mock.module("@vortexfi/shared", () => ({
          ...shared,
          getEvmTokensForNetwork: realGetEvmTokensForNetwork,
          getOnChainTokenDetails: realGetOnChainTokenDetails
        }));
        if (savedPrice !== undefined) {
          world.prices.cryptoUsd[tokenId] = savedPrice;
        }
        Object.assign(world.squidRouter, { computeToAmount, computeToAmountUsd, transactionValueWei });
      }
    });
  }
});
