import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
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
import { getEvmFundingAccount } from "../../api/services/phases/evm-funding";
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
  userId: string;
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
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupType: "none",
      markupValue: 0,
      maxSubsidy: 0,
      payoutAddressEvm: null,
      targetDiscount: 0
    });
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.evm.setErc20Balance(
      Networks.Polygon,
      ALFREDPAY_ERC20_TOKEN,
      getEvmFundingAccount(Networks.Polygon).address,
      0n
    );
    world.squidRouter.computeToAmount = params => params.fromAmount;
    // The bridged token is Polygon USDT (6 decimals); the fake's 18-decimal default would
    // shrink the bridged USD amount to ~0 and mask fee math behind subsidy padding.
    world.squidRouter.toTokenDecimals = 6;
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

  async function createQuoteViaApi(
    options: { authUserId?: string } = {}
  ): Promise<{ id: string; inputAmount: string; outputAmount: string }> {
    // An authenticated quote picks up the user's profile-assigned pricing partner.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.authUserId) {
      headers.Authorization = `Bearer ${testUserToken(options.authUserId)}`;
    }

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
      headers,
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

  async function setUpRegisteredRamp(options: { pricingPartner?: Partner } = {}): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

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
      userId: user.id,
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
    "fee + target discount: subsidy preserves the promised net payout while the full fee is collected",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      // 17 MXN flat fee = exactly 1 USD at the fake 17 MXN/USD rate: legible numbers throughout.
      await updatePartnerPricing("vortex", RampDirection.SELL, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        maxSubsidy: 0.1,
        payoutAddressEvm: vortexPayout,
        targetDiscount: 0.01
      });

      const setup = await setUpRegisteredRamp();

      // Discount math uses the 17 MXN/USD oracle: the 1% target closes a
      // 34 MXN fee-plus-discount gap. Back-solving that target funds a 101 USDT
      // Alfredpay deposit, which the fake provider converts to 2020 MXN.
      const quote = await QuoteTicket.findByPk(setup.quoteId);
      expect(Number(quote?.outputAmount)).toBe(2020);
      expect(Number(quote?.metadata.fees?.usd?.vortex)).toBe(1);
      expect(Number(quote?.metadata.subsidy?.subsidyAmountInOutputTokenDecimal)).toBe(34);
      expect(setup.inputAmountRaw).toBe(parseUnits("101", ALFREDPAY_ERC20_DECIMALS));
      expect(quote?.metadata.preNabla?.platformFeeSnapshot?.vortex).toEqual({ amount: "17.00", usd: "1" });

      // Registration prepared a Polygon distributeFees transfer paying the 1 USDT residual
      // to the vortex payout address; sign exactly that blueprint (plus required backups).
      const registered = await RampState.findByPk(setup.rampId);
      const feeBlueprint = registered?.unsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const feeTxData = feeBlueprint?.txData as unknown as EvmTxBlueprint;

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
      const feeUpdateResponse = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          presignedTxs: [
            {
              meta: { additionalTxs: feeBackups },
              network: Networks.Polygon,
              nonce: feeNonce,
              phase: "distributeFees",
              signer: setup.ephemeral.address,
              txData: await signFeeTransfer(feeNonce)
            }
          ],
          rampId: setup.rampId
        }),
        headers: {
          Authorization: `Bearer ${testUserToken(setup.userId)}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      expect(feeUpdateResponse.status).toBe(200);

      scriptHappyWorld(setup);
      // The user's 100 USDT has arrived. Final settlement must contribute 2 USDT
      // so the ephemeral can send the 101 USDT deposit and retain the 1 USDT fee.
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        setup.ephemeral.address,
        parseUnits("100", ALFREDPAY_ERC20_DECIMALS)
      );
      const fundingAccount = getEvmFundingAccount(Networks.Polygon);
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        fundingAccount.address,
        parseUnits("100", ALFREDPAY_ERC20_DECIMALS)
      );
      const applySerializedTransfers = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        if (!tx.serialized && tx.data && tx.to?.toLowerCase() === ALFREDPAY_ERC20_TOKEN.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data as `0x${string}` });
          const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
          world.evm.setErc20Balance(
            Networks.Polygon,
            ALFREDPAY_ERC20_TOKEN,
            recipient,
            world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, recipient) + amount
          );
          return;
        }
        applySerializedTransfers?.(tx);
      };
      const depositAddress = world.alfredpay.offrampDepositAddress;

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual([
        ...HAPPY_PATH_PHASES.slice(0, -1),
        "distributeFees",
        "complete"
      ]);

      // Alfredpay received the 101 USDT deposit that yields the promised net
      // 2020 MXN; the vortex payout address independently received 1 USDT.
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(setup.inputAmountRaw);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(
        parseUnits("1", ALFREDPAY_ERC20_DECIMALS)
      );
    },
    30000
  );

  it("fee integrity: deposit plus distributed fee reconciles exactly with the bridged amount", async () => {
    // Non-integer FX so the converted fee is a repeating decimal (10 MXN at 16.7 MXN/USD
    // = 0.598802395... USDT): the deduction, the Alfredpay deposit, and the distributeFees
    // transfer must all floor to the SAME raw amount, conserving every raw unit.
    const originalMxnRate = world.prices.perUsd.mxn;
    world.prices.perUsd.mxn = 16.7;
    try {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      await updatePartnerPricing("vortex", RampDirection.SELL, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 10,
        payoutAddressEvm: vortexPayout
      });

      const setup = await setUpRegisteredRamp();

      const registered = await RampState.findByPk(setup.rampId);
      const feeBlueprint = registered?.unsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const decoded = decodeFunctionData({
        abi: erc20Abi,
        data: (feeBlueprint?.txData as unknown as { data: `0x${string}` }).data
      });
      const [, feeAmountRaw] = decoded.args as [`0x${string}`, bigint];
      expect(feeAmountRaw).toBe(598802n);

      // Exact raw-unit conservation: bridged amount = Alfredpay deposit + distributed fee.
      const persisted = await QuoteTicket.findByPk(setup.quoteId);
      const depositRaw = BigInt(persisted?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
      expect(depositRaw + feeAmountRaw).toBe(parseUnits("100", ALFREDPAY_ERC20_DECIMALS));
    } finally {
      world.prices.perUsd.mxn = originalMxnRate;
    }
  });

  it("fee integrity: split vortex/partner components round per component and still reconcile exactly", async () => {
    // Two 0.005 MXN components: rounded per component (like calculateFeeComponents)
    // each becomes 0.01 MXN, while the aggregate would round to 0.01 total — the
    // deduction must follow the per-component convention or distribution would move
    // twice what was deducted.
    const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
    const partnerPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: vortexPayout });
    const partner = await createTestPartner({
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 0.005,
      name: "split-dust-partner",
      payoutAddressEvm: partnerPayout,
      rampType: RampDirection.SELL,
      vortexFeeType: "absolute",
      vortexFeeValue: 0.005
    });

    const setup = await setUpRegisteredRamp({ pricingPartner: partner });

    const registered = await RampState.findByPk(setup.rampId);
    const feeBlueprints = (registered?.unsignedTxs ?? [])
      .filter(tx => tx.phase === "distributeFees")
      .sort((a, b) => a.nonce - b.nonce);
    expect(feeBlueprints).toHaveLength(2);

    // Each 0.01 MXN component floors to 588 raw USDT at the 17 MXN/USD rate.
    let distributedRaw = 0n;
    for (const blueprint of feeBlueprints) {
      const decoded = decodeFunctionData({
        abi: erc20Abi,
        data: (blueprint.txData as unknown as { data: `0x${string}` }).data
      });
      const [, amountRaw] = decoded.args as [`0x${string}`, bigint];
      expect(amountRaw).toBe(588n);
      distributedRaw += amountRaw;
    }

    // Exact raw-unit conservation: bridged amount = Alfredpay deposit + distributed fees.
    const persisted = await QuoteTicket.findByPk(setup.quoteId);
    const depositRaw = BigInt(persisted?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
    expect(depositRaw + distributedRaw).toBe(parseUnits("100", ALFREDPAY_ERC20_DECIMALS));
  });

  it("fee integrity: a markup partner without an EVM payout address cannot be quoted", async () => {
    // The markup would be charged against the user's payout but could never be paid
    // out on Polygon — quote creation must fail closed instead of stranding the fee.
    const user = await createTestUser();
    const partner = await createTestPartner({
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      name: "no-payout-partner",
      rampType: RampDirection.SELL
    });
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: partner.id,
      partnerName: partner.name,
      userId: user.id
    });

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
    "transient failure: an RPC outage on the ephemeral gas funding is recoverable and the ramp still completes",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const depositAddress = world.alfredpay.offrampDepositAddress;

      // The ephemeral starts without gas, so fundEphemeral must broadcast a
      // native funding transfer from the funding account. Apply that value
      // transfer to the ledger on top of scriptHappyWorld's ERC-20 effects.
      world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, 0n);
      const applyErc20Transfers = world.evm.onTransaction;
      world.evm.onTransaction = tx => {
        if (!tx.serialized && tx.to && tx.value) {
          world.evm.setNativeBalance(tx.network, tx.to, world.evm.nativeBalance(tx.network, tx.to) + tx.value);
          return;
        }
        applyErc20Transfers?.(tx);
      };
      // The first broadcast of this corridor is now that funding transfer.
      world.evm.failNextSends = 1;
      world.evm.sendFailureMessage = "FakeEvm: scripted RPC outage";

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      // The outage surfaced as exactly one recoverable fundEphemeral error...
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("Error funding ephemeral account")) ?? [];
      expect(outageLogs.length).toBe(1);
      expect(outageLogs.every(log => log.phase === "fundEphemeral" && log.recoverable === true)).toBe(true);

      // ...and after the retry the deposit transfer reached the chain exactly
      // once, paying the anchor in full.
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
    "subsidy cap (F-001): a settlement shortfall needing more than MAX_FINAL_SETTLEMENT_SUBSIDY_USD of native fails instead of paying",
    async () => {
      const setup = await setUpRegisteredRamp();
      world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
      // Only 90% of the expected USDT arrived (exactly the minimum bridge
      // delivery ratio, so the balance poll passes): the 10 USDT shortfall
      // must be subsidized. The funding account holds no USDT, so the handler
      // prices a native→USDT swap; at 0.5 USD/MATIC the required ~22 MATIC
      // (incl. the 10% buffer) is worth $11 — above the $10 F-001 cap.
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        setup.ephemeral.address,
        (setup.inputAmountRaw * 9n) / 10n
      );
      world.squidRouter.computeToAmount = params => (BigInt(params.fromAmount) / 2n / 10n ** 12n).toString();

      await phaseProcessor.processRamp(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(final?.errorLogs.some(log => log.error.includes("exceeds maximum allowed"))).toBe(true);

      // The deposit transfer never reached the chain and nothing was subsidized.
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
