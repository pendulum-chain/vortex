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
import type Partner from "../../models/partner.model";
import ProfilePartnerAssignment from "../../models/profilePartnerAssignment.model";
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
  userId: string;
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
    await updatePartnerPricing("vortex", RampDirection.BUY, {
      markupType: "none",
      markupValue: 0,
      maxSubsidy: 0,
      payoutAddressEvm: null,
      targetDiscount: 0
    });
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.alfredpay.onrampRate = ALFREDPAY_RATE;
    world.alfredpay.onCreateOnramp = undefined;
    world.alfredpay.onrampStatus = AlfredpayOnrampStatus.TRADE_COMPLETED;
    world.alfredpay.onrampStatusMetadata = null;
  });

  async function createQuoteViaApi(options: { authUserId?: string } = {}): Promise<{ id: string; outputAmount: string }> {
    // An authenticated quote picks up the user's profile-assigned pricing partner.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.authUserId) {
      headers.Authorization = `Bearer ${testUserToken(options.authUserId)}`;
    }

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
      headers,
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
  async function setUpRegisteredRamp(
    options: { recipient?: `0x${string}`; pricingPartner?: Partner } = {}
  ): Promise<CorridorSetup> {
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
    const mintAmountRaw = BigInt(persistedQuote?.metadata.alfredpayMint?.outputAmountRaw ?? "0");
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

    return { amountRaw, destination, ephemeral, mintAmountRaw, quoteId: quote.id, rampId: ramp.id, signedTransfer, userId: user.id };
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
      const parsed = tx.serialized ? parseTransaction(tx.serialized as `0x${string}`) : { data: tx.data, to: tx.to };
      if (!parsed.to || !parsed.data) {
        return;
      }
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: parsed.data as `0x${string}` });
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
      expect(Number(quote?.outputAmount)).toBe(101);
      expect(Number(quote?.metadata.fees?.usd?.vortex)).toBe(1);
      expect(Number(quote?.metadata.subsidy?.subsidyAmountInOutputTokenDecimal)).toBe(2);

      // Registration prepared a Polygon distributeFees transfer paying the 1 USDT residual
      // to the vortex payout address; sign exactly that blueprint (plus required backups).
      const rampState = await RampState.findByPk(setup.rampId);
      const feeBlueprint = rampState?.unsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const feeTxData = feeBlueprint?.txData as unknown as { data: `0x${string}`; to: `0x${string}` };

      async function signFeeTransfer(nonce: number): Promise<`0x${string}`> {
        return setup.ephemeral.signTransaction({
          chainId: 137,
          data: feeTxData.data,
          gas: 100_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 5_000_000_000n,
          nonce,
          to: feeTxData.to,
          type: "eip1559"
        });
      }
      const feeNonce = feeBlueprint?.nonce ?? 1;
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: feeNonce + i, txData: await signFeeTransfer(feeNonce + i) };
      }
      await updateRampViaApi(setup.rampId, setup.userId, {
        meta: { additionalTxs: feeBackups },
        network: Networks.Polygon,
        nonce: feeNonce,
        phase: "distributeFees",
        signer: setup.ephemeral.address,
        txData: await signFeeTransfer(feeNonce)
      });

      scriptHappyWorld(setup);
      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual([
        ...HAPPY_PATH_PHASES.slice(0, -1),
        "distributeFees",
        "complete"
      ]);

      // Destination received the promised net 101 USDT; the fee metadata and
      // on-chain collection remain the full 1 USDT.
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.destination)).toBe(parseUnits("101", 6));
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
    },
    30000
  );

  it(
    "fee collection: a retry after a partial fee distribution pays only the outstanding transfer",
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

      const setup = await setUpRegisteredRamp({ pricingPartner: partner });
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(Number(quote?.outputAmount)).toBe(98);

      const rampState = await RampState.findByPk(setup.rampId);
      const feeBlueprints = (rampState?.unsignedTxs ?? [])
        .filter(tx => tx.phase === "distributeFees")
        .sort((a, b) => a.nonce - b.nonce);
      expect(feeBlueprints).toHaveLength(2);
      // Single gas buffer: the blueprint carries the UNBUFFERED estimate (the SDK
      // applies the 3x multiplier at signing) — the fake EVM estimates 1 gwei.
      expect((feeBlueprints[0].txData as unknown as { maxFeePerGas: string }).maxFeePerGas).toBe("1000000000");

      const signedFeeTransfers: `0x${string}`[] = [];
      for (const blueprint of feeBlueprints) {
        const feeTxData = blueprint.txData as unknown as { data: `0x${string}`; to: `0x${string}` };
        const sign = (nonce: number) =>
          setup.ephemeral.signTransaction({
            chainId: 137,
            data: feeTxData.data,
            gas: 100_000n,
            maxFeePerGas: 5_000_000_000n,
            maxPriorityFeePerGas: 5_000_000_000n,
            nonce,
            to: feeTxData.to,
            type: "eip1559"
          });
        const backups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
        for (let i = 1; i <= 4; i++) {
          backups[`backup${i}`] = { nonce: blueprint.nonce + i, txData: await sign(blueprint.nonce + i) };
        }
        const signedPrimary = await sign(blueprint.nonce);
        signedFeeTransfers.push(signedPrimary);
        await updateRampViaApi(setup.rampId, setup.userId, {
          meta: { additionalTxs: backups },
          network: Networks.Polygon,
          nonce: blueprint.nonce,
          phase: "distributeFees",
          signer: setup.ephemeral.address,
          txData: signedPrimary
        });
      }
      // Both split-fee presigns must survive the update merge.
      const merged = await RampState.findByPk(setup.rampId);
      expect(merged?.presignedTxs?.filter(tx => tx.phase === "distributeFees")).toHaveLength(2);

      scriptHappyWorld(setup);
      // After the FIRST fee transfer lands: simulate the spend (only the 1 USDT partner
      // fee remains on the ephemeral) and fail the next broadcast (the second transfer)
      // once. The retry must skip the paid transfer and require only the unpaid amount.
      const creditLedger = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        creditLedger?.(tx);
        if (tx.serialized === signedFeeTransfers[0]) {
          world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, parseUnits("1", 6));
          world.evm.failNextSends = 1;
        }
      };

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");

      // The paid transfer was broadcast exactly once; each recipient got its exact fee.
      expect(submissionsOf(signedFeeTransfers[0])).toBe(1);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, partnerPayout)).toBe(parseUnits("1", 6));
    },
    30000
  );

  it("fee integrity: a positive markup that rounds to zero does not require a payout address", async () => {
    // The configured value is positive, but the collectible component rounds to
    // 0.00 MXN. The payout guard must use that computed raw fee, not configuration.
    const user = await createTestUser();
    const partner = await createTestPartner({
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 0.001,
      name: "rounded-zero-markup-partner",
      rampType: RampDirection.BUY
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: partner.id,
      partnerName: partner.name,
      userId: user.id
    });

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
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(201);
    const quote = (await response.json()) as { outputAmount: string; partnerFeeUsd: string };
    expect(Number(quote.partnerFeeUsd)).toBe(0);
    expect(Number(quote.outputAmount)).toBe(100);
  });

  it(
    "fee ordering: a reverted destination transfer fails before any fee is collected",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      await updatePartnerPricing("vortex", RampDirection.BUY, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        payoutAddressEvm: vortexPayout
      });

      const setup = await setUpRegisteredRamp();
      const rampState = await RampState.findByPk(setup.rampId);
      const feeBlueprint = rampState?.unsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const feeTxData = feeBlueprint?.txData as unknown as { data: `0x${string}`; to: `0x${string}` };
      const signFee = (nonce: number) =>
        setup.ephemeral.signTransaction({
          chainId: 137,
          data: feeTxData.data,
          gas: 100_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 5_000_000_000n,
          nonce,
          to: feeTxData.to,
          type: "eip1559"
        });
      const feeNonce = feeBlueprint?.nonce ?? 1;
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: feeNonce + i, txData: await signFee(feeNonce + i) };
      }
      const signedFee = await signFee(feeNonce);
      await updateRampViaApi(setup.rampId, setup.userId, {
        meta: { additionalTxs: feeBackups },
        network: Networks.Polygon,
        nonce: feeNonce,
        phase: "distributeFees",
        signer: setup.ephemeral.address,
        txData: signedFee
      });

      scriptHappyWorld(setup);
      const applyLedgerEffects = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        if (tx.serialized === setup.signedTransfer) {
          world.evm.revertedReceiptHashes.add(tx.hash.toLowerCase());
          return;
        }
        applyLedgerEffects?.(tx);
      };

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.errorLogs.some(log => log.error.includes("failed on chain"))).toBe(true);
      expect(submissionsOf(signedFee)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(0n);
    },
    30000
  );

  it(
    "fee collection: a mined-but-reverted fee transfer fails the ramp explicitly instead of retrying forever",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      await updatePartnerPricing("vortex", RampDirection.BUY, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        payoutAddressEvm: vortexPayout
      });

      const setup = await setUpRegisteredRamp();
      const rampState = await RampState.findByPk(setup.rampId);
      const feeBlueprint = rampState?.unsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();

      // Sign and submit the fee transfer presign so the distribution phase engages.
      const feeTxData = feeBlueprint?.txData as unknown as { data: `0x${string}`; to: `0x${string}` };
      const signFee = (nonce: number) =>
        setup.ephemeral.signTransaction({
          chainId: 137,
          data: feeTxData.data,
          gas: 100_000n,
          maxFeePerGas: 5_000_000_000n,
          maxPriorityFeePerGas: 5_000_000_000n,
          nonce,
          to: feeTxData.to,
          type: "eip1559"
        });
      const feeNonce = feeBlueprint?.nonce ?? 1;
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: feeNonce + i, txData: await signFee(feeNonce + i) };
      }
      await updateRampViaApi(setup.rampId, setup.userId, {
        meta: { additionalTxs: feeBackups },
        network: Networks.Polygon,
        nonce: feeNonce,
        phase: "distributeFees",
        signer: setup.ephemeral.address,
        txData: await signFee(feeNonce)
      });

      // A previous attempt broadcast the fee transfer and it was mined but REVERTED:
      // its nonce is consumed, so the phase must fail explicitly rather than loop.
      const revertedHash = "0x00000000000000000000000000000000000000000000000000000000dead0001";
      world.evm.revertedReceiptHashes.add(revertedHash);
      await rampState?.update({
        state: { ...rampState.state, distributeFeeHashes: { [String(feeBlueprint?.nonce)]: revertedHash } }
      });

      scriptHappyWorld(setup);
      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.errorLogs.some(log => log.error.includes("REVERTED"))).toBe(true);
      // Nothing was paid out and the primary was never rebroadcast.
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(0n);

      world.evm.revertedReceiptHashes.delete(revertedHash);
    },
    30000
  );

  it("fee integrity: a markup partner without an EVM payout address cannot be quoted", async () => {
    // The markup would be charged against the user's output but could never be paid
    // out on Polygon — quote creation must fail closed instead of stranding the fee.
    const user = await createTestUser();
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
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("EVM payout address");
  });

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
