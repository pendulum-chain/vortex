import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayOnrampStatus,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getEvmFundingAccount } from "../../api/services/phases/evm-funding";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { getBlockMetadata } from "../../api/services/quote/blocks/core/metadata";
import { AlfredpayMintContext } from "../../api/services/quote/blocks/phases/alfredpay-mint/simulation";
import { SquidRouterSwapContext } from "../../api/services/quote/blocks/phases/squid-router-swap/simulation";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import Subsidy, { SubsidyToken } from "../../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const USDT_ON_ARBITRUM = evmTokenConfig[Networks.Arbitrum][EvmToken.USDT]?.erc20AddressSourceChain as `0x${string}`;
if (!USDT_ON_ARBITRUM) {
  throw new Error("USDT token config missing for Arbitrum");
}

const CHAIN_IDS: Partial<Record<Networks, number>> = {
  [Networks.Arbitrum]: 42161,
  [Networks.Polygon]: 137
};

// Unlike the Polygon-direct corridor, the squidRouterSwap phase executes for
// real here (Polygon mint token → Arbitrum USDT) and squidRouterPay settles
// via the destination-chain balance check.
const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

// 2000 MXN * 0.05 = 100 USDT: a legible flat rate for the fake anchor.
const ALFREDPAY_RATE = 0.05;

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) USDT amount the presigned destination transfer pays out on Arbitrum. */
  amountRaw: bigint;
  /** Raw (6-decimal) mint-token amount Alfredpay mints on the Polygon ephemeral. */
  mintAmountRaw: bigint;
  /** Raw (6-decimal) USDT amount the squid bridge delivers on Arbitrum. */
  bridgedAmountRaw: bigint;
  signedSquidApprove: `0x${string}`;
  signedSquidSwap: `0x${string}`;
  signedTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
}

/**
 * Corridor scenario tests for the CROSS-CHAIN Alfredpay onramp (MXN spei →
 * mint on Polygon → SquidRouter bridge → USDT on Arbitrum): quote,
 * registration and presigned-tx submission go through the real HTTP API, then
 * the REAL PhaseProcessor executes the squid approve+swap on Polygon
 * (squidRouterSwap), settles the bridge via the Arbitrum balance check
 * (squidRouterPay), and pays the destination on Arbitrum — the path the
 * Polygon-direct MXN corridor skips entirely.
 */
describe("MXN onramp cross-chain corridor (spei → Polygon mint → USDT on Arbitrum)", () => {
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
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.alfredpay.onrampRate = ALFREDPAY_RATE;
    world.alfredpay.onCreateOnramp = undefined;
    world.alfredpay.onrampStatus = AlfredpayOnrampStatus.TRADE_COMPLETED;
    world.alfredpay.onrampStatusMetadata = null;
    world.squidRouter.bridgeStatus = "success";
    // The bridge leg swaps the 6-decimal Polygon mint token into 6-decimal
    // Arbitrum USDT; the fake route must report matching decimals.
    world.squidRouter.toTokenDecimals = 6;
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "spei",
        inputAmount: "2000",
        inputCurrency: FiatToken.MXN,
        network: Networks.Arbitrum,
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.Arbitrum
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
    destination: `0x${string}`
  ): Promise<{ id: string }> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: destination },
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

  /** Signs a blueprint exactly as issued; the nonce may be overridden for backups. */
  async function signBlueprint(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx, nonce?: number): Promise<`0x${string}`> {
    const txData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}`; value?: string };
    const chainId = CHAIN_IDS[blueprint.network];
    if (!chainId) {
      throw new Error(`No chain id mapped for ${blueprint.network}`);
    }
    return ephemeral.signTransaction({
      chainId,
      data: txData.data,
      gas: 600_000n,
      // validatePresignedTxs enforces the blueprint's fee minimums (3 gwei floor on Polygon).
      maxFeePerGas: 5_000_000_000n,
      maxPriorityFeePerGas: 5_000_000_000n,
      nonce: nonce ?? blueprint.nonce,
      to: txData.to,
      type: "eip1559",
      value: BigInt(txData.value ?? "0")
    });
  }

  /** validatePresignedTxs requires 4 same-call backups at the next 4 nonces. */
  async function presignWithBackups(ephemeral: PrivateKeyAccount, blueprint: UnsignedTx) {
    const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      backups[`backup${i}`] = { nonce: blueprint.nonce + i, txData: await signBlueprint(ephemeral, blueprint, blueprint.nonce + i) };
    }
    return {
      meta: { additionalTxs: backups },
      network: blueprint.network,
      nonce: blueprint.nonce,
      phase: blueprint.phase,
      signer: ephemeral.address,
      txData: await signBlueprint(ephemeral, blueprint)
    };
  }

  /**
   * Creates quote + registration through the HTTP API, then submits the
   * presigned squid approve/swap (Polygon) and destination transfer (Arbitrum)
   * through the real update endpoint — which also creates the Alfredpay order.
   */
  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, destination);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    if (!persistedQuote) {
      throw new Error("Quote not found after registration");
    }
    const mintAmountRaw = BigInt(getBlockMetadata(persistedQuote.metadata, AlfredpayMintContext).outputAmountRaw);
    const bridgedAmountRaw = BigInt(getBlockMetadata(persistedQuote.metadata, SquidRouterSwapContext).outputAmountRaw);
    expect(mintAmountRaw).toBeGreaterThan(0n);
    expect(bridgedAmountRaw).toBeGreaterThan(0n);

    const rampState = await RampState.findByPk(ramp.id);
    if (!rampState) {
      throw new Error("Ramp state not found after registration");
    }
    const unsignedTxs = rampState.unsignedTxs ?? [];

    // The cross-chain branch: real squid transactions on Polygon plus the
    // destination transfer on Arbitrum.
    const approveBlueprint = blueprintOf(unsignedTxs, "squidRouterApprove");
    const swapBlueprint = blueprintOf(unsignedTxs, "squidRouterSwap");
    const transferBlueprint = blueprintOf(unsignedTxs, "destinationTransfer");
    expect(approveBlueprint.network).toBe(Networks.Polygon);
    expect(swapBlueprint.network).toBe(Networks.Polygon);
    expect(transferBlueprint.network).toBe(Networks.Arbitrum);

    const approvePresign = await presignWithBackups(ephemeral, approveBlueprint);
    const swapPresign = await presignWithBackups(ephemeral, swapBlueprint);
    const transferPresign = await presignWithBackups(ephemeral, transferBlueprint);

    const response = await app.request("/v1/ramp/update", {
      body: JSON.stringify({ presignedTxs: [approvePresign, swapPresign, transferPresign], rampId: ramp.id }),
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(200);

    const updated = await RampState.findByPk(ramp.id);
    expect(updated?.state.alfredpayTransactionId).toBeTruthy();

    const transferTxData = transferBlueprint.txData as unknown as { data: `0x${string}` };
    const { args } = decodeFunctionData({ abi: erc20Abi, data: transferTxData.data });
    const amountRaw = (args as [string, bigint])[1];

    return {
      amountRaw,
      bridgedAmountRaw,
      destination,
      ephemeral,
      mintAmountRaw,
      quoteId: quote.id,
      rampId: ramp.id,
      signedSquidApprove: approvePresign.txData,
      signedSquidSwap: swapPresign.txData,
      signedTransfer: transferPresign.txData
    };
  }

  /**
   * Scripts the fake world so every polling loop succeeds on its first check:
   * - the Alfredpay mint has already credited the ephemeral's Polygon balance,
   * - the ephemeral has gas on Polygon AND Arbitrum (destination funding),
   * - the broadcast squid swap credits the bridged USDT on Arbitrum,
   * - raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup, options: { bridgedAmountRaw?: bigint } = {}): void {
    const bridged = options.bridgedAmountRaw ?? setup.bridgedAmountRaw;
    world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setNativeBalance(Networks.Arbitrum, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, setup.mintAmountRaw);
    world.evm.onTransaction = tx => {
      if (tx.serialized === setup.signedSquidSwap) {
        world.evm.setErc20Balance(
          Networks.Arbitrum,
          USDT_ON_ARBITRUM,
          setup.ephemeral.address,
          world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, setup.ephemeral.address) + bridged
        );
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

  function submissionsOf(signedTx: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTx).length;
  }

  it(
    "happy path: bridges the Polygon mint to Arbitrum via squid and pays the destination there",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);

      // Registration requested a Polygon mint-token → Arbitrum USDT route for
      // the ephemeral.
      const registrationRoute = world.squidRouter.requestedRoutes.find(
        route =>
          route.fromToken.toLowerCase() === ALFREDPAY_ERC20_TOKEN.toLowerCase() &&
          route.toToken.toLowerCase() === USDT_ON_ARBITRUM.toLowerCase()
      );
      expect(registrationRoute, "registration should request a Polygon→Arbitrum route").toBeDefined();
      expect(registrationRoute?.fromChain).toBe("137");
      expect(registrationRoute?.toChain).toBe("42161");

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.squidRouterApproveHash).toBeTruthy();
      expect(final?.state.squidRouterSwapHash).toBeTruthy();

      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(world.alfredpay.onrampOrders.length).toBe(1);

      // The squid approve+swap each hit Polygon exactly once, and the
      // destination received exactly the quoted USDT on Arbitrum.
      expect(submissionsOf(setup.signedSquidApprove)).toBe(1);
      expect(submissionsOf(setup.signedSquidSwap)).toBe(1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "transient failure: an RPC outage on the Arbitrum destination transfer is recoverable and the corridor still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      // Arm the outage once the squid swap has landed so it hits the NEXT
      // broadcast — the Arbitrum destination transfer.
      const applyLedgerEffects = world.evm.onTransaction;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";
      world.evm.onTransaction = tx => {
        applyLedgerEffects?.(tx);
        if (tx.serialized === setup.signedSquidSwap) {
          world.evm.failNextSends = 1;
        }
      };

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);

      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "settlement subsidy: a small bridge shortfall on Arbitrum is topped up (within cap) and the destination is paid in full",
    async () => {
      const setup = await setUpRegisteredRamp();
      // The bridge slips by 1 USDT — well under the final-settlement cap, so
      // finalSettlementSubsidy must top up the ephemeral on ARBITRUM. The
      // subsidy is paid from the funding account's own USDT.
      const fundingAccount = getEvmFundingAccount(Networks.Arbitrum);
      world.evm.setErc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, fundingAccount.address, parseUnits("1000", 6));
      const shortfall = parseUnits("1", 6);
      scriptHappyWorld(setup, { bridgedAmountRaw: setup.bridgedAmountRaw - shortfall });

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      // The funding account sent exactly the shortfall as a USDT transfer to
      // the ephemeral on ARBITRUM, and its hash was recorded for idempotency.
      expect(final?.state.finalSettlementSubsidyTxHash).toBeTruthy();
      const subsidyTransfers = world.evm.sentTransactions.filter(tx => {
        if (tx.network !== Networks.Arbitrum || tx.from?.toLowerCase() !== fundingAccount.address.toLowerCase() || !tx.data) {
          return false;
        }
        const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data as `0x${string}` });
        const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
        return (
          decoded.functionName === "transfer" &&
          recipient.toLowerCase() === setup.ephemeral.address.toLowerCase() &&
          amount === shortfall
        );
      });
      expect(subsidyTransfers.length).toBe(1);
      expect(world.evm.erc20Balance(Networks.Arbitrum, USDT_ON_ARBITRUM, setup.destination)).toBe(setup.amountRaw);

      // The top-up is recorded in the subsidies table so accounting sees it,
      // just like the gas subsidy in squidRouterPay.
      const subsidyRows = await Subsidy.findAll({ where: { phase: "finalSettlementSubsidy", rampId: setup.rampId } });
      expect(subsidyRows.length).toBe(1);
      expect(subsidyRows[0].token).toBe(SubsidyToken.USDT);
      expect(subsidyRows[0].amount).toBeCloseTo(1);
      expect(subsidyRows[0].payerAccount.toLowerCase()).toBe(fundingAccount.address.toLowerCase());
      expect(subsidyRows[0].transactionHash).toBe(final?.state.finalSettlementSubsidyTxHash as string);
    },
    30000
  );
});
