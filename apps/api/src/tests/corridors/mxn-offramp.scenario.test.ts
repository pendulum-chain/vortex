import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayOfframpStatus,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import { BaseError, ContractFunctionExecutionError, decodeFunctionData, erc20Abi, parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseUnits } from "viem/utils";
import phaseProcessor from "../../api/services/phases/phase-processor";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

// finalSettlementSubsidy is a no-op here (the user transfer delivers the full
// amount) but appears in the history.
const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "squidRouterPermitExecute",
  "fundEphemeral",
  "finalSettlementSubsidy",
  "alfredpayOfframpTransfer",
  "complete"
];

// 100 USDT * 20 = 2000 MXN: a legible flat rate for the fake anchor.
const ALFREDPAY_OFFRAMP_RATE = 20;
const FIAT_ACCOUNT_ID = "test-fiat-account-1";

interface EvmTxBlueprint {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
}

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) USDT amount the offramp moves. */
  inputAmountRaw: bigint;
  signedOfframpTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  userWallet: PrivateKeyAccount;
  userTransferBlueprint: EvmTxBlueprint;
}

/**
 * Corridor scenario tests for the MXN offramp direct no-permit path (USDT on
 * Polygon → spei via Alfredpay): quote and registration go through the real
 * HTTP API (registration creates the Alfredpay order and probes EIP-2612
 * support — scripted away so the user broadcasts a plain transfer), the user's
 * reported tx hash and the presigned deposit transfer go through
 * /v1/ramp/update, then the REAL PhaseProcessor drives the ramp to complete
 * against the fake external world.
 */
describe("MXN offramp direct corridor (USDT on Polygon → spei, no-permit)", () => {
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
    world.alfredpay.offrampRate = ALFREDPAY_OFFRAMP_RATE;
    world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED;
    // Fresh deposit address per test: the in-memory EVM ledger persists across
    // tests, so a shared address would accumulate balances between scenarios.
    world.alfredpay.offrampDepositAddress = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // Polygon USDT has no EIP-2612 support in this scenario: the nonces() probe
    // fails as a contract-call error, steering registration onto the no-permit
    // path where the user broadcasts a plain transfer from their own wallet.
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "nonces") {
        throw new ContractFunctionExecutionError(new BaseError("nonces() reverted"), {
          abi: erc20Abi,
          contractAddress: params.address,
          functionName: "nonces"
        });
      }
      return undefined;
    };
  });

  async function createQuoteViaApi(): Promise<{ id: string; inputAmount: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Polygon,
        inputAmount: "100",
        inputCurrency: EvmToken.USDT,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: "spei"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; inputAmount: string; outputAmount: string };
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    ephemeral: PrivateKeyAccount,
    userWallet: PrivateKeyAccount
  ): Promise<{ id: string; unsignedTxs: UnsignedTx[] }> {
    const response = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { fiatAccountId: FIAT_ACCOUNT_ID, walletAddress: userWallet.address },
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
    return (await response.json()) as { id: string; unsignedTxs: UnsignedTx[] };
  }

  function blueprintOf(unsignedTxs: UnsignedTx[], phase: RampPhase): EvmTxBlueprint {
    const blueprint = unsignedTxs.find(tx => tx.phase === phase);
    expect(blueprint, `missing ${phase} blueprint in register response`).toBeDefined();
    return blueprint?.txData as unknown as EvmTxBlueprint;
  }

  async function setUpRegisteredRamp(): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, userWallet);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const inputAmountRaw = BigInt(persistedQuote?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
    expect(inputAmountRaw).toBeGreaterThan(0n);

    // The register RESPONSE withholds user-wallet txs until the ephemeral
    // presigns pass (filterUnsignedTxsForResponse), so blueprints are read
    // from the persisted state like the processor does.
    const registered = await RampState.findByPk(ramp.id);
    const allUnsignedTxs = registered?.unsignedTxs ?? [];
    const userTransferBlueprint = blueprintOf(allUnsignedTxs, "squidRouterNoPermitTransfer");
    const offrampTransferBlueprint = blueprintOf(allUnsignedTxs, "alfredpayOfframpTransfer");

    // Sign exactly the blueprint the backend issued for the ephemeral's
    // deposit transfer (plus the four required same-call backups).
    async function signBlueprint(nonce: number): Promise<`0x${string}`> {
      return ephemeral.signTransaction({
        chainId: 137,
        data: offrampTransferBlueprint.data,
        gas: 100_000n,
        // validatePresignedTxs enforces a 3 gwei floor on Polygon fees.
        maxFeePerGas: 5_000_000_000n,
        maxPriorityFeePerGas: 5_000_000_000n,
        nonce,
        to: offrampTransferBlueprint.to,
        type: "eip1559"
      });
    }
    const signedOfframpTransfer = await signBlueprint(0);
    const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
    for (let i = 1; i <= 4; i++) {
      backups[`backup${i}`] = { nonce: i, txData: await signBlueprint(i) };
    }

    // The user "broadcasts" the source-of-funds transfer from their own wallet
    // and the frontend reports the hash through the update endpoint together
    // with the presigned deposit transfer.
    const userTxHash = world.evm.broadcastUserTransaction(Networks.Polygon, userWallet.address, {
      data: userTransferBlueprint.data,
      to: userTransferBlueprint.to,
      value: 0n
    });

    const updateResponse = await app.request("/v1/ramp/update", {
      body: JSON.stringify({
        additionalData: { squidRouterNoPermitTransferHash: userTxHash },
        presignedTxs: [
          {
            meta: { additionalTxs: backups },
            network: Networks.Polygon,
            nonce: 0,
            phase: "alfredpayOfframpTransfer",
            signer: ephemeral.address,
            txData: signedOfframpTransfer
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
    expect(updateResponse.status).toBe(200);

    const rampState = await RampState.findByPk(ramp.id);
    expect(rampState?.state.alfredpayTransactionId).toBeTruthy();
    expect(rampState?.state.isDirectTransfer).toBe(true);
    expect(rampState?.state.isNoPermitFallback).toBe(true);

    return {
      ephemeral,
      inputAmountRaw,
      quoteId: quote.id,
      rampId: ramp.id,
      signedOfframpTransfer,
      userTransferBlueprint,
      userWallet
    };
  }

  /**
   * Scripts the fake world for the happy path: the user's transfer already
   * credited the ephemeral's USDT, the ephemeral has Polygon gas, and raw
   * ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, setup.inputAmountRaw);
    world.evm.onTransaction = tx => {
      if (!tx.serialized) {
        return;
      }
      const parsed = parseTransaction(tx.serialized as `0x${string}`);
      if (!parsed.to || !parsed.data) {
        return;
      }
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: parsed.data });
      if (functionName !== "transfer") {
        return;
      }
      const [recipient, amount] = args as [`0x${string}`, bigint];
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
    "happy path: processes the full Alfredpay offramp phase sequence to complete",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const depositAddress = world.alfredpay.offrampDepositAddress;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.alfredpayOfframpTransferTxHash).toBeTruthy();

      // Quote stays consumed; exactly one Alfredpay order exists and the
      // deposit address received exactly the quoted USDT per the fake ledger.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(world.alfredpay.offrampOrders.length).toBe(1);
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(setup.inputAmountRaw);
    },
    30000
  );

  it(
    "security regression: a reported user tx whose calldata does not match the blueprint fails the ramp unrecoverably",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);

      // Overwrite the reported hash with a tampered user transfer that pays a
      // different recipient than the blueprint demanded.
      const attacker = privateKeyToAccount(generatePrivateKey()).address;
      const { encodeFunctionData } = await import("viem");
      const tamperedHash = world.evm.broadcastUserTransaction(Networks.Polygon, setup.userWallet.address, {
        data: encodeFunctionData({ abi: erc20Abi, args: [attacker, setup.inputAmountRaw], functionName: "transfer" }),
        to: ALFREDPAY_ERC20_TOKEN,
        value: 0n
      });
      const rampState = await RampState.findByPk(setup.rampId);
      await rampState?.update({
        state: { ...rampState.state, squidRouterNoPermitTransferHash: tamperedHash }
      });

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      // The ephemeral's deposit transfer must never have been broadcast.
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, world.alfredpay.offrampDepositAddress)).toBe(0n);
    },
    30000
  );

  it(
    "unrecoverable failure: an Alfredpay FAILED order status fails the ramp during the transfer phase",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FAILED;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
    },
    30000
  );
});
