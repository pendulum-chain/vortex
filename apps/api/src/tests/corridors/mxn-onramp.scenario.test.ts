import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayOnrampStatus,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase
} from "@vortexfi/shared";
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import phaseProcessor from "../../api/services/phases/phase-processor";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser } from "../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

// squidRouterSwap appears in the history but skips internally on the direct
// (mint token == output token) corridor; the subsidy phases are no-ops here.
const HAPPY_PATH_PHASES: RampPhase[] = [
  "initial",
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

// 2000 MXN * 0.05 = 100 USDT: a legible flat rate for the fake anchor.
const ALFREDPAY_RATE = 0.05;

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  /** Raw (6-decimal) USDT amount the presigned transfer pays out. */
  amountRaw: bigint;
  /** Raw (6-decimal) USDT amount Alfredpay mints on the ephemeral. */
  mintAmountRaw: bigint;
  signedTransfer: `0x${string}`;
  ephemeral: PrivateKeyAccount;
  destination: `0x${string}`;
}

/**
 * Corridor scenario tests for the MXN onramp direct path (spei → USDT on
 * Polygon, the Alfredpay mint token): quote and registration go through the
 * real HTTP API, /v1/ramp/update creates the Alfredpay order, then the REAL
 * PhaseProcessor drives the ramp from initial to complete against the fake
 * external world (see HAPPY_PATH_PHASES for the full sequence).
 */
describe("MXN onramp direct corridor (spei → USDT on Polygon)", () => {
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
  });

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "spei",
        inputAmount: "2000",
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.Polygon
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

  /**
   * Submits a presigned tx through the real update endpoint. For Alfredpay
   * corridors this also triggers the order creation (alfredpayTransactionId
   * lands in state).
   */
  async function updateRampViaApi(
    rampId: string,
    userId: string,
    presignedTx: { meta?: object; network: Networks; nonce: number; phase: string; signer: string; txData: `0x${string}` }
  ): Promise<void> {
    const response = await app.request("/v1/ramp/update", {
      body: JSON.stringify({ presignedTxs: [{ meta: {}, ...presignedTx }], rampId }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(200);
  }

  /**
   * Creates quote + registration + Alfredpay order through the HTTP API with a
   * fresh ephemeral key pair, then stores a REAL signed ERC-20 USDT transfer as
   * the presigned destinationTransfer. Pass a recipient to sign a transfer that
   * pays someone other than the registered destination.
   */
  async function setUpRegisteredRamp(options: { recipient?: `0x${string}` } = {}): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const quote = await createQuoteViaApi();
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, destination);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const metadata = persistedQuote?.metadata as unknown as
      | { blocks: { alfredpayMint?: { outputAmountRaw?: string } } }
      | undefined;
    const mintAmountRaw = BigInt(metadata?.blocks.alfredpayMint?.outputAmountRaw ?? "0");
    expect(mintAmountRaw).toBeGreaterThan(0n);

    const amountRaw = parseUnits(quote.outputAmount, ALFREDPAY_ERC20_DECIMALS);
    async function signTransfer(recipient: `0x${string}`, nonce: number): Promise<`0x${string}`> {
      return ephemeral.signTransaction({
        chainId: 137,
        data: encodeFunctionData({
          abi: erc20Abi,
          args: [recipient, amountRaw],
          functionName: "transfer"
        }),
        gas: 100_000n,
        // validatePresignedTxs enforces a 3 gwei floor on Polygon fees.
        maxFeePerGas: 5_000_000_000n,
        maxPriorityFeePerGas: 5_000_000_000n,
        nonce,
        to: ALFREDPAY_ERC20_TOKEN,
        type: "eip1559"
      });
    }

    // validatePresignedTxs requires 4 same-call backups at the following nonces.
    async function signBackups(recipient: `0x${string}`): Promise<Record<string, { nonce: number; txData: `0x${string}` }>> {
      const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        backups[`backup${i}`] = { nonce: i, txData: await signTransfer(recipient, i) };
      }
      return backups;
    }

    // The correct transfer goes through the real update endpoint (which also
    // creates the Alfredpay order).
    await updateRampViaApi(ramp.id, user.id, {
      meta: { additionalTxs: await signBackups(destination) },
      network: Networks.Polygon,
      nonce: 0,
      phase: "destinationTransfer",
      signer: ephemeral.address,
      txData: await signTransfer(destination, 0)
    });

    const rampState = await RampState.findByPk(ramp.id);
    if (!rampState) {
      throw new Error("Ramp state not found after registration");
    }
    expect(rampState.state.alfredpayTransactionId).toBeTruthy();

    let signedTransfer = rampState.presignedTxs?.[0]?.txData as `0x${string}`;
    if (options.recipient) {
      // The wrong-recipient variant is swapped in at the DB layer: it models a
      // presigned tx that slipped past the API, so the corridor asserts the
      // PROCESSOR-level validation net catches it before funds move.
      signedTransfer = await signTransfer(options.recipient, 0);
      await rampState.update({
        presignedTxs: [
          {
            meta: {},
            network: Networks.Polygon,
            nonce: 0,
            phase: "destinationTransfer",
            signer: ephemeral.address,
            txData: signedTransfer
          }
        ]
      });
    }

    return { amountRaw, destination, ephemeral, mintAmountRaw, quoteId: quote.id, rampId: ramp.id, signedTransfer };
  }

  /**
   * Scripts the fake world so every polling loop succeeds on its first check:
   * - the Alfredpay mint has already credited the ephemeral's USDT,
   * - the ephemeral already has Polygon gas, so fundEphemeral sends nothing,
   * - submitted raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(setup: CorridorSetup): void {
    world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, setup.mintAmountRaw);
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
    "happy path: processes the full Alfredpay onramp phase sequence to complete",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.state.destinationTransferTxHash).toBeTruthy();

      // Quote stays consumed; exactly one Alfredpay order was created and the
      // destination received exactly the quoted USDT per the fake ledger.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(quote?.status).toBe("consumed");
      expect(world.alfredpay.onrampOrders.length).toBe(1);
      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "transient failure: retries a failed destinationTransfer broadcast (recoverable) and still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBeGreaterThanOrEqual(1);
      expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);

      expect(submissionsOf(setup.signedTransfer)).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(setup.amountRaw);
    },
    30000
  );

  it(
    "security regression: presigned transfer paying the wrong recipient fails the ramp unrecoverably",
    async () => {
      const wrongRecipient = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      const setup = await setUpRegisteredRamp({ recipient: wrongRecipient });
      scriptHappyWorld(setup);

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.phaseHistory.map(entry => entry.phase)).not.toContain("complete");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("recipient mismatch"))).toBe(true);

      // The mismatching transfer must never reach the chain, and nobody gets paid.
      expect(submissionsOf(setup.signedTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, wrongRecipient)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(0n);
    },
    30000
  );

  it(
    "unrecoverable failure: an Alfredpay FAILED order status fails the ramp during the mint phase",
    async () => {
      const setup = await setUpRegisteredRamp();
      // Gas is there, but the mint never arrives and Alfredpay reports FAILED.
      world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
      world.alfredpay.onrampStatus = AlfredpayOnrampStatus.FAILED;
      world.alfredpay.onrampStatusMetadata = { failureReason: "scripted compliance rejection" };

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(submissionsOf(setup.signedTransfer)).toBe(0);
    },
    30000
  );
});
