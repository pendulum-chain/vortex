import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  AveniaTicketStatus,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
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

  // The EVM→BRL route still requires a Substrate entry in signingAccounts
  // (validateOfframpQuote legacy default) even though this path never uses it to
  // sign — all signing here is EVM. A static well-known SS58 address keeps the test
  // off the @polkadot WASM keyring, whose CJS/ESM dual-load intermittently leaves an
  // uninitialized bridge under Bun and crashed this suite in CI.
  const SUBSTRATE_PLACEHOLDER_ADDRESS = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

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
        signingAccounts: [
          { address: ephemeral.address, type: "EVM" },
          { address: SUBSTRATE_PLACEHOLDER_ADDRESS, type: "Substrate" }
        ]
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
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    return ephemeral.signTransaction({
      chainId: 8453,
      data: txData.data,
      gas: 600_000n,
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 5_000_000_000n,
      nonce: blueprint.nonce,
      to: txData.to,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
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
  async function setUpRegisteredRamp(options: { reportHashes?: boolean } = {}): Promise<CorridorSetup> {
    const reportHashes = options.reportHashes ?? true;
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, userWallet);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const swapInputRaw = BigInt(persistedQuote?.metadata.nablaSwapEvm?.inputAmountForSwapRaw ?? "0");
    const swapOutputRaw = BigInt(persistedQuote?.metadata.nablaSwapEvm?.outputAmountRaw ?? "0");
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

    return {
      approveBlueprint,
      approveHash,
      ephemeral,
      quoteId: quote.id,
      rampId: ramp.id,
      signedNablaSwap,
      signedPayout,
      swapBlueprint,
      swapHash,
      swapInputRaw,
      swapOutputRaw,
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
});
