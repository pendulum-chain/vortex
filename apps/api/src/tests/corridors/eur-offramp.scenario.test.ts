import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EphemeralAccountType,
  EPaymentMethod,
  type EvmTransactionData,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  MykoboTransactionStatus,
  MykoboTransactionType,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { validateEphemeralAccountsFresh } from "../../api/services/ramp/ephemeral-freshness";
import { normalizeAndValidateSigningAccounts } from "../../api/services/ramp/ramp.service";
import { accountCapabilities } from "../../api/services/phases/blocks/core/accounts";
import { getBlockMetadata, getFlowMetadata } from "../../api/services/phases/blocks/core/metadata";
import { resolvePersistedBlockFlow } from "../../api/services/phases/blocks/flows/catalog";
import { makeEurOfframpBaseFlow } from "../../api/services/phases/blocks/flows/eur-offramp-base";
import { MykoboOfframpPayoutContext } from "../../api/services/phases/blocks/phases/mykobo-offramp-payout/simulation";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import FinancialOperation from "../../models/financialOperation.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import Subsidy from "../../models/subsidy.model";
import type { SubsidyToken } from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestQuote, createTestRampState, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";

function requireBaseToken(token: EvmToken) {
  const details = evmTokenConfig[Networks.Base][token];
  if (!details) {
    throw new Error(`${token} token config missing for Base`);
  }
  return details;
}
const USDC_ON_BASE = requireBaseToken(EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const EURC_ON_BASE = requireBaseToken(EvmToken.EURC).erc20AddressSourceChain as `0x${string}`;

const IP_ADDRESS = "203.0.113.7";

const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "mykoboPayoutOnBase",
  "complete"
];

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) USDC amount the Nabla swap consumes. */
  swapInputRaw: bigint;
  /** Raw (6-decimal) EURC amount the swap yields. */
  swapOutputRaw: bigint;
  /** Raw (6-decimal) EURC amount the payout transfers to Mykobo's receivables. */
  payoutAmountRaw: bigint;
  signedNablaSwap: `0x${string}`;
  signedPayout: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  mykoboTransactionId: string;
  receivablesAddress: string;
}

/**
 * Legacy-recovery scenario tests for the former EUR offramp (USDC on Base →
 * SEPA via Mykobo). New EUR offramp quotes are rejected, so these tests persist
 * an identity-bearing Mykobo quote directly and call the real block
 * `Flow.register` and `prepareTxs`, which resolve the KYC-gated Mykobo customer,
 * create the WITHDRAW intent and build all blueprints. The REAL PhaseProcessor drives initial →
 * fundEphemeral → distributeFees → subsidizePreSwap → nablaApprove →
 * nablaSwap → subsidizePostSwap → mykoboPayoutOnBase → complete against the
 * fake external world.
 */
describe("legacy Mykobo EUR offramp recovery", () => {
  let world: FakeWorld;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
  });

  afterAll(async () => {
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    // The EVM fee distribution transaction builder requires the vortex
    // partner's EVM payout address even when the resulting fees are zero.
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" });
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.mykobo.failNextIntent = null;
    world.mykobo.profileKycReviewStatus = "approved";
    // Fresh receivables address per test: the in-memory EVM ledger persists
    // across tests, so a shared payout recipient would accumulate balances.
    world.mykobo.withdrawReceivablesAddress = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // The initialize stage bridges Base USDC → Base USDC: the fake route's
    // destination token must report USDC's 6 decimals or the quote pipeline
    // mis-scales the swap input and pads the whole output with subsidy.
    world.squidRouter.toTokenDecimals = 6;
    // Deterministic Nabla quoter for USDC → EURC (both 6 decimals) at a flat
    // 0.9 EURC per USDC, matching the FakePrices 0.9 EUR/USD feed. The EURC
    // token itself shares the euro peg for USD conversions.
    world.prices.perUsd.eurc = 0.9;
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return (amountIn * 9n) / 10n;
      }
      return undefined;
    };
  });

  async function createLegacyQuote(): Promise<{ id: string; outputAmount: string }> {
    const request = {
      from: Networks.Base,
      inputAmount: "100",
      inputCurrency: EvmToken.USDC,
      network: Networks.Base,
      outputCurrency: FiatToken.EURC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SEPA
    };
    const simulated = await makeEurOfframpBaseFlow(EvmToken.USDC, Networks.Base).simulate({
      addNote: () => undefined,
      notes: [],
      now: new Date(),
      partner: null,
      request,
      targetFeeFiatCurrency: FiatToken.EURC
    });
    const quote = await createTestQuote({
      from: request.from,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata: simulated.metadata as never,
      network: request.network,
      outputAmount: simulated.output.amount.toFixed(2, 0),
      outputCurrency: request.outputCurrency,
      paymentMethod: request.to,
      rampType: request.rampType,
      to: request.to
    });
    return { id: quote.id, outputAmount: quote.outputAmount };
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
   * Registers the persisted legacy ramp with signing-account normalization, ephemeral
   * freshness validation, the REAL offramp transaction preparation (which
   * creates the Mykobo WITHDRAW intent), quote consumption, and a RampState
   * row with the identical shape. Then signs the ephemeral blueprints exactly
   * as issued and stores them the way /v1/ramp/update would, and broadcasts
   * the user's source-of-funds USDC transfer whose hash fundEphemeral
   * verifies against the blueprint.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    const user = await createTestUser();
    const quote = await createLegacyQuote();

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    if (!persistedQuote) {
      throw new Error("Quote not persisted");
    }
    const metadata = getFlowMetadata(persistedQuote.metadata);
    const nablaMetadata = getBlockMetadata(metadata, NablaSwapContext);
    const swapInputRaw = BigInt(nablaMetadata.inputAmountForSwapRaw);
    const swapOutputRaw = BigInt(nablaMetadata.outputAmountRaw);
    expect(swapInputRaw).toBeGreaterThan(0n);
    expect(swapOutputRaw).toBeGreaterThan(0n);

    const additionalData = {
      destinationAddress: userWallet.address,
      ipAddress: IP_ADDRESS,
      walletAddress: userWallet.address
    };
    const { normalizedSigningAccounts, ephemerals } = normalizeAndValidateSigningAccounts([
      { address: ephemeral.address, type: EphemeralAccountType.EVM }
    ]);
    await validateEphemeralAccountsFresh(ephemerals, persistedQuote);

    const flow = resolvePersistedBlockFlow(metadata);
    const quoteFields = persistedQuote.get({ plain: true });
    const registered = await flow.register({
      authenticatedUser: { id: user.id },
      input: { walletAddress: additionalData.walletAddress },
      ipAddress: additionalData.ipAddress,
      metadata,
      quote: quoteFields,
      signingAccounts: normalizedSigningAccounts,
    });
    const prepared = await flow.prepareTxs({
      accounts: accountCapabilities(normalizedSigningAccounts),
      destinationAddress: additionalData.destinationAddress,
      metadata: registered.metadata,
      quote: quoteFields,
      registrationFacts: registered.registrationFacts,
      userId: user.id
    });
    const payoutState = prepared.stateMeta.blockState?.[MykoboOfframpPayoutContext.key] as Record<string, unknown>;
    const { stateMeta, unsignedTxs } = {
      stateMeta: { ...prepared.stateMeta, ...payoutState, walletAddress: additionalData.walletAddress },
      unsignedTxs: prepared.unsignedTxs
    };

    const [consumed] = await QuoteTicket.update(
      { status: "consumed" },
      { where: { id: persistedQuote.id, status: "pending" } }
    );
    expect(consumed).toBe(1);

    const rampState = await createTestRampState({
      currentPhase: "initial",
      from: persistedQuote.from,
      paymentMethod: persistedQuote.paymentMethod,
      phaseHistory: [{ phase: "initial", timestamp: new Date() }],
      quoteId: persistedQuote.id,
      state: {
        evmEphemeralAddress: ephemerals.EVM,
        substrateEphemeralAddress: ephemerals.Substrate,
        ...additionalData,
        ...stateMeta
      } as unknown as RampState["state"],
      to: persistedQuote.to,
      type: persistedQuote.rampType,
      unsignedTxs,
      userId: user.id
    });

    const nablaApproveBlueprint = blueprintOf(unsignedTxs, "nablaApprove");
    const nablaSwapBlueprint = blueprintOf(unsignedTxs, "nablaSwap");
    const payoutBlueprint = blueprintOf(unsignedTxs, "mykoboPayoutOnBase");

    const payoutData = payoutBlueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}` };
    const decodedPayout = decodeFunctionData({ abi: erc20Abi, data: payoutData.data });
    const [payoutRecipient, payoutAmountRaw] = decodedPayout.args as [string, bigint];
    expect(payoutRecipient.toLowerCase()).toBe(world.mykobo.withdrawReceivablesAddress);

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
      mykoboTransactionId: stateMeta.mykoboTransactionId as string,
      payoutAmountRaw,
      quoteId: persistedQuote.id,
      rampId: rampState.id,
      receivablesAddress: world.mykobo.withdrawReceivablesAddress,
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
   * - raw ERC-20 transfers are applied to the in-memory ledger,
   * - the broadcast Nabla swap credits the ephemeral's EURC at the quoted output,
   * - Mykobo reports the withdraw transaction as COMPLETED once polled.
   */
  function scriptHappyWorld(setup: CorridorSetup, options: { usdcShortfallRaw?: bigint } = {}): void {
    const shortfall = options.usdcShortfallRaw ?? 0n;
    const fundingAccount = getEvmFundingAccount(Networks.Base);
    world.evm.setNativeBalance(Networks.Base, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setNativeBalance(Networks.Base, fundingAccount.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, fundingAccount.address, parseUnits("1000000", 6));
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, setup.ephemeral.address, setup.swapInputRaw - shortfall);
    world.mykobo.setTransactionStatus(setup.mykoboTransactionId, MykoboTransactionStatus.COMPLETED);
    world.evm.onTransaction = tx => {
      if (tx.serialized === setup.signedNablaSwap) {
        world.evm.setErc20Balance(Networks.Base, EURC_ON_BASE, setup.ephemeral.address, setup.swapOutputRaw);
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
    "happy path: swap corridor completes with a capped pre-swap subsidy and pays Mykobo's receivables in full",
    async () => {
      const setup = await setUpRegisteredRamp();
      // 1 USDC short of the swap input: well below the 5% subsidy cap.
      const shortfall = parseUnits("1", 6);
      scriptHappyWorld(setup, { usdcShortfallRaw: shortfall });

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
      expect(subsidies.map(subsidy => subsidy.phase)).toEqual(["subsidizePreSwap"]);
      expect(subsidies.find(subsidy => subsidy.phase === "subsidizePreSwap")?.token).toBe(
        EvmToken.USDC as unknown as SubsidyToken
      );
      expect(Number(subsidies.find(subsidy => subsidy.phase === "subsidizePreSwap")?.amount)).toBeCloseTo(1);

      // The swap and payout were each broadcast exactly once; Mykobo's
      // receivables wallet received exactly the intent value in EURC.
      expect(submissionsOf(setup.signedNablaSwap)).toBe(1);
      expect(submissionsOf(setup.signedPayout)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, setup.receivablesAddress)).toBe(setup.payoutAmountRaw);

      // Registration created exactly one WITHDRAW intent whose 2-decimal value
      // matches the on-chain payout (Mykobo truncates to cents).
      const intents = world.mykobo.intents.filter(intent => intent.wallet_address === setup.ephemeral.address);
      expect(intents.length).toBe(1);
      expect(intents[0].transaction_type).toBe(MykoboTransactionType.WITHDRAW);
      expect(parseUnits(intents[0].value, 6)).toBe(setup.payoutAmountRaw);
    },
    30000
  );

  it(
    "ambiguous payout failure: a scripted RPC outage pauses the corridor for reconciliation",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      // Arm the outage once the swap has landed so it hits the NEXT broadcast —
      // the mykoboPayoutOnBase transfer, whose send failures are recoverable.
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
      expect(final?.currentPhase).toBe("mykoboPayoutOnBase");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      // The phase records the transport error, then the durable operation
      // blocks blind retries because the provider outcome is unknown.
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("Failed to send Mykobo payout transaction")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "mykoboPayoutOnBase")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);
      expect(final?.errorLogs.some(log => log.error.includes("requires reconciliation"))).toBe(true);
      expect(
        await FinancialOperation.findOne({ where: { phase: "mykoboPayoutOnBase", scopeId: setup.rampId } })
      ).toMatchObject({ status: "unknown" });
      expect(world.evm.erc20Balance(Networks.Base, EURC_ON_BASE, setup.receivablesAddress)).toBe(0n);
    },
    30000
  );

  it(
    "unrecoverable failure: a FAILED Mykobo withdraw transaction fails the ramp during mykoboPayoutOnBase",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.mykobo.setTransactionStatus(setup.mykoboTransactionId, MykoboTransactionStatus.FAILED);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("ended with status FAILED"))).toBe(true);
    },
    30000
  );

  it(
    "registration guard: a Mykobo WITHDRAW intent failure aborts the registration path before any blueprint exists",
    async () => {
      const user = await createTestUser();
      const quote = await createLegacyQuote();
      const persistedQuote = await QuoteTicket.findByPk(quote.id);
      const ephemeral = privateKeyToAccount(generatePrivateKey());
      const userWallet = privateKeyToAccount(generatePrivateKey());
      world.mykobo.failNextIntent = new Error("FakeMykobo: scripted intent failure");

      const { normalizedSigningAccounts } = normalizeAndValidateSigningAccounts([
        { address: ephemeral.address, type: EphemeralAccountType.EVM }
      ]);
      await expect(
        resolvePersistedBlockFlow(getFlowMetadata((persistedQuote as QuoteTicket).metadata)).register({
          authenticatedUser: { id: user.id },
          input: { walletAddress: userWallet.address },
          ipAddress: IP_ADDRESS,
          metadata: getFlowMetadata((persistedQuote as QuoteTicket).metadata),
          quote: (persistedQuote as QuoteTicket).get({ plain: true }),
          signingAccounts: normalizedSigningAccounts,
        })
      ).rejects.toThrow("scripted intent failure");
      expect((await QuoteTicket.findByPk(quote.id))?.status).toBe("pending");
    },
    30000
  );
});
