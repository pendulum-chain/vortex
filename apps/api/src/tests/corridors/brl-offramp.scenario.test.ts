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
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import Subsidy from "../../models/subsidy.model";
import type { SubsidyToken } from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

function requireBaseToken(token: EvmToken) {
  const details = evmTokenConfig[Networks.Base][token];
  if (!details) {
    throw new Error(`${token} token config missing for Base`);
  }
  return details;
}
const USDC_ON_BASE = requireBaseToken(EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const BRLA_ON_BASE = requireBaseToken(EvmToken.BRLA).erc20AddressSourceChain as `0x${string}`;

const TAX_ID = "12345678901";
// FakeBrla.validatePixKey reports this as the pix key owner's tax id; the
// registration-time receiver check must be given a matching value.
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";

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
  /** Raw (6-decimal) USDC amount the Nabla swap consumes. */
  swapInputRaw: bigint;
  /** Raw (18-decimal) BRLA amount the swap yields and the payout transfers. */
  swapOutputRaw: bigint;
  signedNablaSwap: `0x${string}`;
  signedPayout: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  payoutBlueprint: UnsignedTx;
}

/**
 * Corridor scenario tests for the BRL offramp swap path (USDC on Base → pix
 * via Avenia): quote and registration go through the real HTTP API, then the
 * REAL PhaseProcessor drives initial → fundEphemeral → distributeFees →
 * subsidizePreSwap → nablaApprove → nablaSwap → subsidizePostSwap →
 * brlaPayoutOnBase → complete against the fake external world. Unlike the
 * direct corridors, the Nabla swap and both EVM subsidy phases execute for
 * real here, so the subsidy caps (F-001 class) are covered end to end.
 */
describe("BRL offramp swap corridor (USDC on Base → pix via Avenia)", () => {
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
    // The initialize stage bridges Base USDC → Base USDC: the fake route's
    // destination token must report USDC's 6 decimals or the quote pipeline
    // mis-scales the swap input and pads the whole output with subsidy.
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
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Base,
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

  async function signBlueprint(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx, nonce?: number): Promise<`0x${string}`> {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    return ephemeral.signTransaction({
      chainId: 8453,
      data: txData.data,
      gas: 600_000n,
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 5_000_000_000n,
      nonce: nonce ?? blueprint.nonce,
      to: txData.to,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
  }

  /**
   * Creates quote + registration through the HTTP API with a fresh ephemeral,
   * signs the ephemeral phase blueprints exactly as issued, and stores them as
   * presigned transactions the way /v1/ramp/update would.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
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

    // The user broadcasts the source-of-funds USDC transfer from their own
    // wallet; fundEphemeral verifies the reported hash against the blueprint.
    const userBlueprint = blueprintOf(unsignedTxs, "squidRouterNoPermitTransfer");
    const userTxData = userBlueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}` };
    const userTxHash = world.evm.broadcastUserTransaction(Networks.Base, userWallet.address, {
      data: userTxData.data,
      to: userTxData.to,
      value: 0n
    });

    await rampState.update({
      presignedTxs: [
        presign(nablaApproveBlueprint, signedNablaApprove),
        presign(nablaSwapBlueprint, signedNablaSwap),
        presign(payoutBlueprint, signedPayout)
      ],
      state: { ...rampState.state, squidRouterNoPermitTransferHash: userTxHash }
    });

    return {
      ephemeral,
      payoutBlueprint,
      quoteId: quote.id,
      rampId: ramp.id,
      signedNablaSwap,
      signedPayout,
      swapInputRaw,
      swapOutputRaw
    };
  }

  /**
   * Scripts the fake world for the happy path:
   * - the ephemeral has Base gas and the user's USDC already arrived, short by
   *   `usdcShortfallRaw` so subsidizePreSwap tops it up from the funding wallet,
   * - raw ERC-20 transfers (serialized presigns and funding-wallet data txs)
   *   are applied to the in-memory ledger,
   * - the broadcast Nabla swap credits the ephemeral's BRLA at the quoted output.
   */
  function scriptHappyWorld(setup: CorridorSetup, options: { usdcShortfallRaw?: bigint; swapOutputRaw?: bigint } = {}): void {
    const shortfall = options.usdcShortfallRaw ?? 0n;
    const swapOutput = options.swapOutputRaw ?? setup.swapOutputRaw;
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address, setup.swapInputRaw - shortfall);
    world.evm.onTransaction = tx => {
      if (tx.serialized === setup.signedNablaSwap) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, setup.ephemeral.address, swapOutput);
        return;
      }
      const parsed = tx.serialized ? parseTransaction(tx.serialized as `0x${string}`) : { data: tx.data, to: tx.to };
      if (!parsed.to || !parsed.data) {
        return;
      }
      let decoded: { functionName: string; args: readonly unknown[] };
      try {
        decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data as `0x${string}` });
      } catch {
        return;
      }
      if (decoded.functionName !== "transfer") {
        return;
      }
      const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
      world.evm.setErc20Balance(
        tx.network,
        parsed.to,
        recipient,
        world.evm.erc20Balance(tx.network, parsed.to, recipient) + amount
      );
    };
  }

  function submissionsOf(signedTransfer: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTransfer).length;
  }

  it(
    "happy path: swap corridor completes with a capped pre-swap subsidy and pays the Avenia subaccount",
    async () => {
      const setup = await setUpRegisteredRamp();
      // 1 USDC short of the swap input: well below the 5% subsidy cap.
      const shortfall = parseUnits("1", 6);
      scriptHappyWorld(setup, { usdcShortfallRaw: shortfall });
      const pixOutBefore = world.brla.pixOutputTickets.length;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      // Quote stays consumed and the pre-swap shortfall was subsidized once.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      const subsidies = await Subsidy.findAll();
      expect(subsidies.length).toBe(1);
      // The handler stores the EvmToken value cast into the SubsidyToken column.
      expect(subsidies[0].token).toBe(EvmToken.USDC as unknown as SubsidyToken);
      expect(Number(subsidies[0].amount)).toBeCloseTo(1);
      expect(subsidies[0].phase).toBe("subsidizePreSwap");

      // The swap and payout were each broadcast exactly once; the Avenia
      // subaccount wallet received exactly the swap output per the fake ledger.
      expect(submissionsOf(setup.signedNablaSwap)).toBe(1);
      expect(submissionsOf(setup.signedPayout)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
      expect(world.brla.pixOutputTickets.length).toBe(pixOutBefore + 1);
    },
    30000
  );

  it(
    "transient failure: a scripted RPC outage is recorded as recoverable and the corridor still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      // Arm the outage once the swap has landed so it hits the NEXT broadcast —
      // the brlaPayoutOnBase transfer, whose send failures are recoverable by
      // design (a failed nablaSwap broadcast is deliberately unrecoverable).
      const applyLedgerEffects = world.evm.onTransaction;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";
      world.evm.onTransaction = tx => {
        applyLedgerEffects?.(tx);
        if (tx.serialized === setup.signedNablaSwap) {
          world.evm.failNextSends = 1;
        }
      };

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      // The payout handler wraps broadcast errors in its own recoverable message.
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("Failed to send BRLA payout transaction")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "brlaPayoutOnBase")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(setup.swapOutputRaw);
    },
    30000
  );

  it(
    "security regression: a presigned payout paying the wrong recipient is rejected by /v1/ramp/update",
    async () => {
      const ephemeral = privateKeyToAccount(generatePrivateKey());
      const userWallet = privateKeyToAccount(generatePrivateKey());
      const attacker = privateKeyToAccount(generatePrivateKey()).address;

      const user = await createTestUser();
      await createTestTaxId(user.id, { taxId: TAX_ID });
      const quote = await createQuoteViaApi();
      const ramp = await registerViaApi(quote.id, user.id, ephemeral, userWallet);

      const rampState = await RampState.findByPk(ramp.id);
      const payoutBlueprint = blueprintOf(rampState?.unsignedTxs ?? [], "brlaPayoutOnBase");
      const blueprintData = payoutBlueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}` };
      const { args } = decodeFunctionData({ abi: erc20Abi, data: blueprintData.data });
      const amount = (args as [string, bigint])[1];

      // Same token, same amount — but the BRLA goes to the attacker instead of
      // the Avenia subaccount wallet the blueprint demands.
      const tamper = (nonce: number) =>
        ephemeral.signTransaction({
          chainId: 8453,
          data: encodeFunctionData({ abi: erc20Abi, args: [attacker, amount], functionName: "transfer" }),
          gas: 600_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 5_000_000_000n,
          nonce,
          to: blueprintData.to,
          type: "eip1559"
        });
      const tamperedPayout = await tamper(payoutBlueprint.nonce);
      const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        backups[`backup${i}`] = { nonce: payoutBlueprint.nonce + i, txData: await tamper(payoutBlueprint.nonce + i) };
      }

      const updateResponse = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          presignedTxs: [
            {
              meta: { additionalTxs: backups },
              network: Networks.Base,
              nonce: payoutBlueprint.nonce,
              phase: "brlaPayoutOnBase",
              signer: ephemeral.address,
              txData: tamperedPayout
            }
          ],
          rampId: ramp.id
        }),
        headers: {
          Authorization: `Bearer ${testUserToken(user.id)}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      expect(updateResponse.status).toBe(400);
      const body = (await updateResponse.json()) as { message?: string };
      expect(body.message ?? JSON.stringify(body)).toContain("does not match expected data");

      // Nothing was stored and nothing can be broadcast.
      const after = await RampState.findByPk(ramp.id);
      expect(after?.presignedTxs ?? []).toEqual([]);
      expect(submissionsOf(tamperedPayout)).toBe(0);
    },
    30000
  );

  it(
    "subsidy cap (F-001 class): a post-swap shortfall beyond the cap pauses the ramp instead of paying out",
    async () => {
      const setup = await setUpRegisteredRamp();
      // The swap yields only half the quoted BRLA: the discrepancy subsidy
      // would be ~50% of the quote output, far beyond the 5% cap.
      scriptHappyWorld(setup, { swapOutputRaw: setup.swapOutputRaw / 2n });

      await phaseProcessor.processRamp(setup.rampId);

      const stuck = await RampState.findByPk(setup.rampId);
      // The cap breach is a recoverable pause for operator intervention — the
      // ramp must NOT be failed, NOT completed, and the lock must be released.
      expect(stuck?.currentPhase).toBe("subsidizePostSwap");
      expect(stuck?.processingLock).toEqual({ locked: false, lockedAt: null });
      const capLogs = stuck?.errorLogs.filter(log => log.error.includes("exceeds cap")) ?? [];
      expect(capLogs.length).toBeGreaterThanOrEqual(1);
      expect(capLogs.every(log => log.recoverable === true)).toBe(true);

      // No subsidy was paid beyond the cap and the payout never reached the chain.
      expect(await Subsidy.count()).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
    },
    60000
  );

  it(
    "subsidy cap (F-001 class): a pre-swap shortfall beyond the cap pauses the ramp before the swap",
    async () => {
      const setup = await setUpRegisteredRamp();
      // Only half the swap input arrived: the required top-up (~50% of the
      // quote output) is far beyond the 5% pre-swap subsidy cap.
      scriptHappyWorld(setup, { usdcShortfallRaw: setup.swapInputRaw / 2n });

      await phaseProcessor.processRamp(setup.rampId);

      const stuck = await RampState.findByPk(setup.rampId);
      expect(stuck?.currentPhase).toBe("subsidizePreSwap");
      expect(stuck?.processingLock).toEqual({ locked: false, lockedAt: null });
      const capLogs = stuck?.errorLogs.filter(log => log.error.includes("exceeds cap")) ?? [];
      expect(capLogs.length).toBeGreaterThanOrEqual(1);
      expect(capLogs.every(log => log.recoverable === true)).toBe(true);

      // Nothing was subsidized, swapped, or paid out.
      expect(await Subsidy.count()).toBe(0);
      expect(submissionsOf(setup.signedNablaSwap)).toBe(0);
      expect(submissionsOf(setup.signedPayout)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(0n);
    },
    60000
  );

  it(
    "unrecoverable failure: a FAILED Avenia payout ticket fails the ramp during brlaPayoutOnBase",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.brla.payoutTicketStatus = AveniaTicketStatus.FAILED;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
    },
    30000
  );
});
