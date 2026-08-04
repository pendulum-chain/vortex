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
import { getFlowMetadata } from "../../api/services/phases/blocks/core/metadata";
import FinancialOperation from "../../models/financialOperation.model";
import type Partner from "../../models/partner.model";
import ProfilePartnerAssignment from "../../models/profilePartnerAssignment.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestPartner, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
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
  "distributeFees",
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
  signedFeeTransfers: `0x${string}`[];
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

  async function requestQuote(options: { authUserId?: string } = {}): Promise<Response> {
    // An authenticated quote picks up the user's profile-assigned pricing partner.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.authUserId) {
      headers.Authorization = `Bearer ${testUserToken(options.authUserId)}`;
    }
    return app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "spei",
        inputAmount: "2000",
        inputCurrency: FiatToken.MXN,
        network: Networks.Polygon,
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY,
        to: Networks.Polygon
      }),
      headers,
      method: "POST"
    });
  }

  async function createQuoteViaApi(options: { authUserId?: string } = {}): Promise<{ id: string; outputAmount: string }> {
    const response = await requestQuote(options);
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
  async function setUpRegisteredRamp(
    options: { recipient?: `0x${string}`; pricingPartner?: Partner } = {}
  ): Promise<CorridorSetup & { userId: string }> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const destination = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    if (options.pricingPartner) {
      // Profile-assigned pricing: the quote stays user-owned (partner_id NULL) but is
      // priced by — and pays markup to — the assigned partner via pricing_partner_id.
      await ProfilePartnerAssignment.create({
        isActive: true,
        partnerId: options.pricingPartner.id,
        partnerName: options.pricingPartner.name,
        userId: user.id
      });
    }
    const quote = await createQuoteViaApi(options.pricingPartner ? { authUserId: user.id } : {});
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

    // Fee-charging quotes carry one distributeFees transfer per fee recipient; sign
    // whatever the route prepared (none for zero-fee quotes) exactly as blueprinted.
    const feeBlueprints = (rampState.unsignedTxs ?? []).filter(tx => tx.phase === "distributeFees");
    const signedFeeTransfers: `0x${string}`[] = [];
    for (const blueprint of feeBlueprints) {
      const blueprintData = blueprint.txData as unknown as { to: `0x${string}`; data: `0x${string}` };
      const signFee = (nonce: number) =>
        ephemeral.signTransaction({
          chainId: 137,
          data: blueprintData.data,
          gas: 100_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 5_000_000_000n,
          nonce,
          to: blueprintData.to,
          type: "eip1559"
        });
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: blueprint.nonce + i, txData: await signFee(blueprint.nonce + i) };
      }
      const signedPrimary = await signFee(blueprint.nonce);
      signedFeeTransfers.push(signedPrimary);
      await updateRampViaApi(ramp.id, user.id, {
        meta: { additionalTxs: feeBackups },
        network: Networks.Polygon,
        nonce: blueprint.nonce,
        phase: "distributeFees",
        signer: ephemeral.address,
        txData: signedPrimary
      });
    }

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

    return {
      amountRaw,
      destination,
      ephemeral,
      mintAmountRaw,
      quoteId: quote.id,
      rampId: ramp.id,
      signedFeeTransfers,
      signedTransfer,
      userId: user.id
    };
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
      // Presigned transfers arrive serialized; funding-account transfers (subsidy
      // top-ups) arrive as data transactions. Both credit the in-memory ledger.
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
    "fee + target discount: subsidy preserves the promised net rate while the full fee is collected",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      // 17 MXN flat fee = exactly 1 USD at the fake 17 MXN/USD rate: legible numbers throughout.
      await updatePartnerPricing("vortex", RampDirection.BUY, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        maxSubsidy: 0.1,
        payoutAddressEvm: vortexPayout,
        targetDiscount: 0.01
      });

      const setup = await setUpRegisteredRamp();

      // Quote: 2000 MXN mints 100 USDT. A 1% target promises the user 101 USDT
      // after fees, so Vortex contributes 2 USDT: 1 for the rate improvement and
      // 1 that economically offsets the separately collected fee.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      const metadata = getFlowMetadata(quote?.metadata);
      expect(Number(quote?.outputAmount)).toBe(101);
      expect(Number(metadata.globals.fees?.usd?.vortex)).toBe(1);
      const preSwap = metadata.blocks.subsidizePreSwap as { subsidyAmountInOutputTokenDecimal: string; feeReserveRaw: string };
      expect(Number(preSwap.subsidyAmountInOutputTokenDecimal)).toBe(2);
      expect(preSwap.feeReserveRaw).toBe(parseUnits("1", 6).toString());

      // Registration prepared ONE Polygon distributeFees transfer (vortex only)
      // paying the 1 USDT residual; setUpRegisteredRamp presigned it.
      expect(setup.signedFeeTransfers).toHaveLength(1);

      scriptHappyWorld(setup);
      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);

      // Destination received the promised net 101 USDT; the fee metadata and
      // on-chain collection remain the full 1 USDT.
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(parseUnits("101", 6));
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
      expect(submissionsOf(setup.signedFeeTransfers[0])).toBe(1);
    },
    30000
  );

  it(
    "fee collection: a partial split distribution halts for reconciliation without double-paying",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      const partnerPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      await updatePartnerPricing("vortex", RampDirection.BUY, { payoutAddressEvm: vortexPayout });
      // 17 MXN flat each = exactly 1 USD: the quote carries a vortex fee AND a partner
      // markup, so registration prepares two sequential fee transfers.
      const partner = await createTestPartner({
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        name: "split-fee-partner",
        payoutAddressEvm: partnerPayout,
        rampType: RampDirection.BUY,
        vortexFeeType: "absolute",
        vortexFeeValue: 17
      });

      // Presigns run through the REAL /v1/ramp/update merge: a nonce-less merge key
      // used to collapse the two distributeFees transfers into one.
      const setup = await setUpRegisteredRamp({ pricingPartner: partner });
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(Number(quote?.outputAmount)).toBe(98);
      expect(setup.signedFeeTransfers).toHaveLength(2);
      const merged = await RampState.findByPk(setup.rampId);
      expect(merged?.presignedTxs?.filter(tx => tx.phase === "distributeFees")).toHaveLength(2);

      scriptHappyWorld(setup);
      // Fail the SECOND fee broadcast: after the first fee transfer lands, the next
      // send throws. Its financial operation becomes ambiguous, so the phase must
      // halt for reconciliation instead of guessing.
      const creditLedger = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        creditLedger?.(tx);
        if (tx.serialized === setup.signedFeeTransfers[0]) {
          world.evm.failNextSends = 1;
        }
      };

      await phaseProcessor.processRamp(setup.rampId);

      const afterFirstRun = await RampState.findByPk(setup.rampId);
      expect(afterFirstRun?.currentPhase).toBe("distributeFees");
      expect(afterFirstRun?.errorLogs.some(log => log.error.includes("requires reconciliation"))).toBe(true);
      // The first transfer was paid exactly once; the second never credited anyone.
      expect(submissionsOf(setup.signedFeeTransfers[0])).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, partnerPayout)).toBe(0n);
      const operations = await FinancialOperation.findAll({
        where: { phase: "distributeFees", scopeId: setup.rampId, scopeType: "ramp" }
      });
      expect(operations.map(op => [op.attemptClass, op.status]).sort()).toEqual([
        ["evm-fee-distribution", "confirmed"],
        [`evm-fee-distribution:${(merged?.presignedTxs ?? []).filter(tx => tx.phase === "distributeFees")[1]?.nonce}`, "unknown"]
      ]);

      // Reprocessing replays the confirmed transfer WITHOUT a second broadcast and
      // halts on the ambiguous one again — no recipient is ever double-paid.
      await phaseProcessor.processRamp(setup.rampId);
      expect(submissionsOf(setup.signedFeeTransfers[0])).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
    },
    30000
  );

  it("quote guard: a positive computed markup without a partner EVM payout address is rejected", async () => {
    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const partner = await createTestPartner({
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      name: "no-payout-partner",
      rampType: RampDirection.BUY
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: partner.id,
      partnerName: partner.name,
      userId: user.id
    });

    const response = await requestQuote({ authUserId: user.id });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toContain("Partner is missing EVM payout address");
  });

  it("quote guard: a configured markup that rounds to zero raw units needs no payout address", async () => {
    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    // Positive configuration, but the computed component rounds to zero raw USDT.
    const partner = await createTestPartner({
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 0.000001,
      name: "rounded-zero-markup-partner",
      rampType: RampDirection.BUY
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: partner.id,
      partnerName: partner.name,
      userId: user.id
    });

    const response = await requestQuote({ authUserId: user.id });
    expect(response.status).toBe(201);
  });

  it(
    "ambiguous destination broadcast: pauses for reconciliation without paying the recipient",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("destinationTransfer");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      const outageLogs = final?.errorLogs.filter(log => log.error.includes("scripted RPC outage")) ?? [];
      expect(outageLogs.length).toBe(1);
      expect(outageLogs.every(log => log.phase === "destinationTransfer")).toBe(true);
      expect(outageLogs.some(log => log.recoverable === true)).toBe(true);
      expect(final?.errorLogs.some(log => log.error.includes("requires reconciliation"))).toBe(true);
      expect(await FinancialOperation.findOne({ where: { phase: "destinationTransfer", scopeId: setup.rampId } })).toMatchObject({
        status: "unknown"
      });
      expect(submissionsOf(setup.signedTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(0n);
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
