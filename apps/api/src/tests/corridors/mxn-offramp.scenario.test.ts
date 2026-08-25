import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, setSystemTime, spyOn } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredpayChain,
  AlfredpayFeeType,
  AlfredpayOfframpStatus,
  type EvmTransactionData,
  EvmToken,
  FiatToken,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  RampDirection,
  type RampPhase,
  type UnsignedTx
} from "@vortexfi/shared";
import {
  BaseError,
  ContractFunctionExecutionError,
  decodeFunctionData,
  erc20Abi,
  parseTransaction
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseUnits } from "viem/utils";
import type { AlfredpayOfframpMetadata } from "../../api/services/phases/blocks/phases/alfredpay-offramp/simulation";
import { AlfredpayOfframpTransferExecutor } from "../../api/services/phases/blocks/phases/alfredpay-offramp/execution";
import phaseProcessor from "../../api/services/phases/phase-processor";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import logger from "../../config/logger";
import FinancialOperation from "../../models/financialOperation.model";
import Subsidy from "../../models/subsidy.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser, updatePartnerPricing } from "../../test-utils/factories";
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
  "distributeFees",
  "complete"
];

// 100 USDT * 20 = 2000 MXN: a legible flat rate for the fake anchor.
const ALFREDPAY_OFFRAMP_RATE = 20;
const FIAT_ACCOUNT_ID = "test-fiat-account-1";

interface EvmTxBlueprint extends EvmTransactionData {
  to: `0x${string}`;
  data: `0x${string}`;
}

interface CorridorSetup {
  rampId: string;
  quoteId: string;
  quoteOutputAmount: string;
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
    // The in-memory ledger persists across tests: drain the funding account's USDT so
    // tests that rely on the native-swap settlement path stay deterministic.
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, getEvmFundingAccount(Networks.Polygon).address, 0n);
    world.squidRouter.computeToAmount = params => params.fromAmount;
    world.squidRouter.computeToAmountMin = params => world.squidRouter.computeToAmount(params);
    world.squidRouter.toTokenDecimals = ALFREDPAY_ERC20_DECIMALS;
    world.alfredpay.offrampRate = ALFREDPAY_OFFRAMP_RATE;
    world.alfredpay.offrampMaxFromAmount = null;
    world.alfredpay.onCreateOfframpQuote = undefined;
    world.alfredpay.offrampQuoteToAmountAdjustmentOnce = null;
    world.alfredpay.nextOfframpQuoteExpiration = null;
    world.alfredpay.nextOfframpQuoteChain = null;
    world.alfredpay.nextOfframpExpiration = null;
    world.alfredpay.nextOfframpOrderStatus = null;
    world.alfredpay.nextOfframpRereadStatus = null;
    world.alfredpay.nextOfframpTransactionId = null;
    world.alfredpay.offrampOrders.splice(0);
    world.alfredpay.issuedOfframpQuotes.clear();
    world.alfredpay.offrampStatusOverrides.clear();
    world.alfredpay.offrampTransactions.clear();
    world.alfredpay.offrampStatus = AlfredpayOfframpStatus.CREATED;
    world.alfredpay.quoteFees = [];
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

  async function createQuoteViaApi(inputAmount = "100"): Promise<{ id: string; inputAmount: string; outputAmount: string }> {
    const squidRouteCount = world.squidRouter.requestedRoutes.length;
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Polygon,
        inputAmount,
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
    expect(world.squidRouter.requestedRoutes).toHaveLength(squidRouteCount);
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

  async function setUpRegisteredRamp(inputAmount = "100"): Promise<CorridorSetup> {
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const quote = await createQuoteViaApi(inputAmount);
    const ramp = await registerViaApi(quote.id, user.id, ephemeral, userWallet);

    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const metadata = persistedQuote?.metadata as unknown as
      | { blocks: { alfredpayOfframp?: { inputAmountRaw?: string } } }
      | undefined;
    const inputAmountRaw = BigInt(metadata?.blocks.alfredpayOfframp?.inputAmountRaw ?? "0");
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
        gas: BigInt(offrampTransferBlueprint.gas),
        maxFeePerGas:
          BigInt(offrampTransferBlueprint.maxFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
        maxPriorityFeePerGas:
          BigInt(offrampTransferBlueprint.maxPriorityFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
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
      quoteOutputAmount: quote.outputAmount,
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
      // Presigned transfers arrive serialized; funding-account transfers (settlement
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
      if (recipient.toLowerCase() === world.alfredpay.offrampDepositAddress.toLowerCase()) {
        world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED;
      }
    };
  }

  function submissionsOf(signedTransfer: `0x${string}`): number {
    return world.evm.sentTransactions.filter(tx => tx.serialized === signedTransfer).length;
  }

  async function processRampWithoutCompletionEmail(rampId: string): Promise<void> {
    // Completion-email enqueueing is deliberately detached from phase processing.
    // This corridor suite resets the database between scenarios, so remove the
    // unrelated recipient before processing to prevent that background query from
    // racing the next test's TRUNCATE.
    await RampState.update({ userId: null }, { where: { id: rampId } });
    await phaseProcessor.processRamp(rampId);
  }

  async function getAlfredpayMetadata(quoteId: string): Promise<AlfredpayOfframpMetadata> {
    const quote = await QuoteTicket.findByPk(quoteId);
    const metadata = (quote?.metadata as unknown as { blocks?: { alfredpayOfframp?: AlfredpayOfframpMetadata } })?.blocks
      ?.alfredpayOfframp;
    expect(metadata).toBeDefined();
    return metadata as AlfredpayOfframpMetadata;
  }

  it("quotes direct Polygon USDT 1:1 without requesting a Squid route", async () => {
    const quote = await createQuoteViaApi();
    const persistedQuote = await QuoteTicket.findByPk(quote.id);
    const metadata = persistedQuote?.metadata as unknown as
      | {
          blocks: {
            alfredpayOfframp?: {
              bridgeInputAmountRaw?: string;
              bridgeOutputAmountRaw?: string;
              pricing?: {
                customer: {
                  allInRate: string;
                  inputAmountUsd: string;
                  referenceDifferenceBps: string;
                };
                provider: {
                  baseCurrency: string;
                  feeAmount: string;
                  fees: Array<{ amount: string; currency: string; type: string }>;
                  grossRate: string;
                  grossReferenceDifferenceBps: string;
                  netRate: string;
                  netReferenceDifferenceBps: string;
                  quoteCurrency: string;
                  quotedAt: string;
                  source: string;
                };
                reference: {
                  baseCurrency: string;
                  observedAt: string;
                  quoteCurrency: string;
                  rate: string;
                  source: string;
                };
              };
            };
          };
        }
      | undefined;
    const expectedRaw = parseUnits(quote.inputAmount, ALFREDPAY_ERC20_DECIMALS).toString();

    expect(metadata?.blocks.alfredpayOfframp?.bridgeInputAmountRaw).toBe(expectedRaw);
    expect(metadata?.blocks.alfredpayOfframp?.bridgeOutputAmountRaw).toBe(expectedRaw);

    const pricing = metadata?.blocks.alfredpayOfframp?.pricing;
    expect(pricing?.reference).toEqual({
      baseCurrency: "USD",
      observedAt: "1970-01-01T00:00:00.000Z",
      quoteCurrency: FiatToken.MXN,
      rate: "17",
      source: "fastforex"
    });
    expect(pricing?.provider).toMatchObject({
      baseCurrency: EvmToken.USDT,
      feeAmount: "0",
      fees: [],
      grossRate: "20",
      netRate: "20",
      quoteCurrency: FiatToken.MXN,
      source: "alfredpay"
    });
    expect(Number(pricing?.provider.grossReferenceDifferenceBps)).toBeCloseTo((20 / 17 - 1) * 10_000);
    expect(Number(pricing?.provider.netReferenceDifferenceBps)).toBeCloseTo((20 / 17 - 1) * 10_000);
    expect(Number(pricing?.customer.inputAmountUsd)).toBe(Number(quote.inputAmount));
    expect(Number(pricing?.customer.allInRate)).toBeCloseTo(Number(quote.outputAmount) / Number(quote.inputAmount));
    expect(Number(pricing?.customer.referenceDifferenceBps)).toBeCloseTo(
      (Number(pricing?.customer.allInRate) / Number(pricing?.reference.rate) - 1) * 10_000
    );
  });

  it("registration can retry safely after a pre-order provider quote drift", async () => {
    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const quote = await createQuoteViaApi();
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());
    const orderCount = world.alfredpay.offrampOrders.length;
    world.alfredpay.offrampQuoteToAmountAdjustmentOnce = "-0.01";

    const first = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { fiatAccountId: FIAT_ACCOUNT_ID, walletAddress: userWallet.address },
        quoteId: quote.id,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(first.status).toBe(422);
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount);
    expect(
      await FinancialOperation.findOne({ where: { attemptClass: "registration", scopeId: quote.id } })
    ).toMatchObject({ status: "failed" });

    await registerViaApi(quote.id, user.id, ephemeral, userWallet);
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(
      await FinancialOperation.findOne({ where: { attemptClass: "registration", scopeId: quote.id } })
    ).toMatchObject({ status: "confirmed" });
  });

  it("cross-chain quotes keep using Squid's estimated output", async () => {
    world.squidRouter.computeToAmount = () => parseUnits("999", 6).toString();
    world.squidRouter.computeToAmountMin = () => parseUnits("989", 6).toString();
    world.squidRouter.toTokenDecimals = 6;
    const quoteResponse = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Base,
        inputAmount: "1000",
        inputCurrency: EvmToken.USDT,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: "spei"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(quoteResponse.status).toBe(201);
    const quote = (await quoteResponse.json()) as { id: string; outputAmount: string };
    const metadata = await getAlfredpayMetadata(quote.id);
    expect(metadata.bridgeOutputAmountRaw).toBe(parseUnits("999", 6).toString());
    expect(metadata.inputAmountRaw).toBe(parseUnits("999", 6).toString());
    expect(quote.outputAmount).toBe("19980.00");

    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id);
    const ephemeral = privateKeyToAccount(generatePrivateKey());
    const userWallet = privateKeyToAccount(generatePrivateKey());
    world.squidRouter.computeToAmountMin = () => parseUnits("900", 6).toString();
    const registration = await app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { fiatAccountId: FIAT_ACCOUNT_ID, walletAddress: userWallet.address },
        quoteId: quote.id,
        signingAccounts: [{ address: ephemeral.address, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(user.id)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(registration.status).toBe(201);
    expect(await RampState.findOne({ where: { quoteId: quote.id } })).toBeDefined();
  });

  it("does not persist an Alfredpay quote that expires before safe registration and signing", async () => {
    world.alfredpay.nextOfframpQuoteExpiration = new Date(Date.now() + 5_000).toISOString();
    const quoteCount = await QuoteTicket.count();
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Polygon,
        inputAmount: "1000",
        inputCurrency: EvmToken.USDT,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: "spei"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).not.toBe(201);
    expect(await QuoteTicket.count()).toBe(quoteCount);
  });

  it("measures provider quote lifetime after provider latency instead of from the pricing snapshot", async () => {
    const startedAt = new Date("2026-08-11T12:00:00.000Z");
    setSystemTime(startedAt);
    world.alfredpay.nextOfframpQuoteExpiration = new Date(startedAt.getTime() + 25_000).toISOString();
    world.alfredpay.onCreateOfframpQuote = () => setSystemTime(new Date(startedAt.getTime() + 20_000));
    const quoteCount = await QuoteTicket.count();
    try {
      const response = await app.request("/v1/quotes", {
        body: JSON.stringify({
          from: Networks.Polygon,
          inputAmount: "1000",
          inputCurrency: EvmToken.USDT,
          network: Networks.Polygon,
          outputCurrency: FiatToken.MXN,
          rampType: RampDirection.SELL,
          to: "spei"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      expect(response.status).not.toBe(201);
      expect(await QuoteTicket.count()).toBe(quoteCount);
    } finally {
      world.alfredpay.onCreateOfframpQuote = undefined;
      setSystemTime();
    }
  });

  it(
    "happy path: processes the full Alfredpay offramp phase sequence to complete",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const depositAddress = world.alfredpay.offrampDepositAddress;

      await processRampWithoutCompletionEmail(setup.rampId);

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
    "fee collection: the vortex fee residual is paid out after the Alfredpay deposit succeeds",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      // 17 MXN flat fee = exactly 1 USD at the fake 17 MXN/USD rate: the deposit
      // shrinks from 100 to 99 USDT and 1 USDT stays reserved on the ephemeral.
      await updatePartnerPricing("vortex", RampDirection.SELL, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        payoutAddressEvm: vortexPayout
      });

      const setup = await setUpRegisteredRamp();
      expect(setup.inputAmountRaw).toBe(parseUnits("99", 6));
      const persistedQuote = await QuoteTicket.findByPk(setup.quoteId);
      const fees = (persistedQuote?.metadata as unknown as { globals?: { fees?: { usd?: { vortex: string } } } }).globals
        ?.fees?.usd;
      expect(Number(fees?.vortex)).toBe(1);

      const rampState = await RampState.findByPk(setup.rampId);
      const allUnsignedTxs = rampState?.unsignedTxs ?? [];

      // The refund fallback is sized deposit + charged fees: a failed ramp returns
      // the user's full 100 USDT, not just the 99 USDT deposit leg.
      const fallbackBlueprint = allUnsignedTxs.find(tx => tx.phase === "alfredpayOfframpTransferFallback");
      const fallbackData = (fallbackBlueprint?.txData as unknown as { data: `0x${string}` }).data;
      const fallbackArgs = decodeFunctionData({ abi: erc20Abi, data: fallbackData }).args as [string, bigint];
      expect(fallbackArgs[1]).toBe(parseUnits("100", 6));

      // Presign the single distributeFees transfer (vortex only) as blueprinted.
      const feeBlueprint = allUnsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const feeData = feeBlueprint?.txData as EvmTransactionData;
      const signFee = (nonce: number) =>
        setup.ephemeral.signTransaction({
          chainId: 137,
          data: feeData.data as `0x${string}`,
          gas: BigInt(feeData.gas),
          maxFeePerGas: BigInt(feeData.maxFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
          maxPriorityFeePerGas:
            BigInt(feeData.maxPriorityFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
          nonce,
          to: feeData.to as `0x${string}`,
          type: "eip1559"
        });
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: (feeBlueprint?.nonce ?? 1) + i, txData: await signFee((feeBlueprint?.nonce ?? 1) + i) };
      }
      const signedFeeTransfer = await signFee(feeBlueprint?.nonce ?? 1);
      const updateResponse = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          presignedTxs: [
            {
              meta: { additionalTxs: feeBackups },
              network: Networks.Polygon,
              nonce: feeBlueprint?.nonce ?? 1,
              phase: "distributeFees",
              signer: setup.ephemeral.address,
              txData: signedFeeTransfer
            }
          ],
          rampId: setup.rampId
        }),
        headers: {
          Authorization: `Bearer ${testUserToken((await RampState.findByPk(setup.rampId))?.userId ?? "")}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      expect(updateResponse.status).toBe(200);

      scriptHappyWorld(setup);
      // The user sent the full 100 USDT: deposit (99) plus the reserved fee (1).
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        setup.ephemeral.address,
        setup.inputAmountRaw + parseUnits("1", 6)
      );
      const depositAddress = world.alfredpay.offrampDepositAddress;

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(final?.phaseHistory.map(entry => entry.phase)).toEqual(HAPPY_PATH_PHASES);

      // The deposit leg paid exactly the fee-reduced amount, then the residual
      // reached the vortex payout address; each transfer broadcast exactly once.
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(setup.inputAmountRaw);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
      expect(submissionsOf(signedFeeTransfer)).toBe(1);
    },
    30000
  );

  it(
    "15 bps target: reconciles Alfredpay spread and fees while funding the executable settlement",
    async () => {
      const vortexPayout = privateKeyToAccount(generatePrivateKey()).address as `0x${string}`;
      world.alfredpay.offrampRate = 16.9;
      world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
      await updatePartnerPricing("vortex", RampDirection.SELL, {
        markupCurrency: FiatToken.MXN,
        markupType: "absolute",
        markupValue: 17,
        maxSubsidy: 0.0095,
        payoutAddressEvm: vortexPayout,
        targetDiscount: 0.0015
      });

      const setup = await setUpRegisteredRamp("1000");
      const metadata = await getAlfredpayMetadata(setup.quoteId);
      expect(setup.quoteOutputAmount).toBe("17025.50");
      expect(setup.inputAmountRaw).toBe(parseUnits("1008.431953", 6));
      expect(metadata.subsidyAmountRaw).toBe(parseUnits("9.431953", 6).toString());
      expect(Number(metadata.outputAmountDecimal)).toBeCloseTo(17025.5000057, 6);
      expect(Number(metadata.pricing.customer.referenceDifferenceBps)).toBeCloseTo(15, 5);
      expect(Number(metadata.pricing.reference.rate)).toBe(17);
      expect(Number(metadata.pricing.provider.grossRate)).toBe(16.9);
      expect(Number(metadata.pricing.provider.feeAmount)).toBe(17);
      expect(
        BigInt(metadata.inputAmountRaw) + parseUnits("1", 6) - BigInt(metadata.bridgeOutputAmountRaw)
      ).toBe(BigInt(metadata.subsidyAmountRaw));

      const rampState = await RampState.findByPk(setup.rampId);
      const allUnsignedTxs = rampState?.unsignedTxs ?? [];

      // The refund fallback returns the user's bridged 1000 USDT — not the subsidized
      // deposit plus fees, which would hand the platform subsidy to the user
      // on a failed ramp.
      const fallbackBlueprint = allUnsignedTxs.find(tx => tx.phase === "alfredpayOfframpTransferFallback");
      const fallbackData = (fallbackBlueprint?.txData as unknown as { data: `0x${string}` }).data;
      const fallbackArgs = decodeFunctionData({ abi: erc20Abi, data: fallbackData }).args as [string, bigint];
      expect(fallbackArgs[1]).toBe(parseUnits("1000", 6));

      const feeBlueprint = allUnsignedTxs.find(tx => tx.phase === "distributeFees");
      expect(feeBlueprint).toBeDefined();
      const feeData = feeBlueprint?.txData as EvmTransactionData;
      const signFee = (nonce: number) =>
        setup.ephemeral.signTransaction({
          chainId: 137,
          data: feeData.data as `0x${string}`,
          gas: BigInt(feeData.gas),
          maxFeePerGas: BigInt(feeData.maxFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
          maxPriorityFeePerGas:
            BigInt(feeData.maxPriorityFeePerGas ?? "0") * PRESIGNED_EVM_FEE_MULTIPLIER,
          nonce,
          to: feeData.to as `0x${string}`,
          type: "eip1559"
        });
      const feeBackups: Record<string, { nonce: number; txData: `0x${string}` }> = {};
      for (let i = 1; i <= 4; i++) {
        feeBackups[`backup${i}`] = { nonce: (feeBlueprint?.nonce ?? 1) + i, txData: await signFee((feeBlueprint?.nonce ?? 1) + i) };
      }
      const signedFeeTransfer = await signFee(feeBlueprint?.nonce ?? 1);
      const updateResponse = await app.request("/v1/ramp/update", {
        body: JSON.stringify({
          presignedTxs: [
            {
              meta: { additionalTxs: feeBackups },
              network: Networks.Polygon,
              nonce: feeBlueprint?.nonce ?? 1,
              phase: "distributeFees",
              signer: setup.ephemeral.address,
              txData: signedFeeTransfer
            }
          ],
          rampId: setup.rampId
        }),
        headers: {
          Authorization: `Bearer ${testUserToken(rampState?.userId ?? "")}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      expect(updateResponse.status).toBe(200);

      scriptHappyWorld(setup);
      // The ephemeral starts with only the user's bridged 1000 USDT. Final settlement
      // funds the exact provider input plus the 1 USDT fee reserve.
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, parseUnits("1000", 6));
      const fundingAddress = getEvmFundingAccount(Networks.Polygon).address;
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, fundingAddress, parseUnits("10", 6));
      const depositAddress = world.alfredpay.offrampDepositAddress;

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(
        parseUnits("1008.431953", 6)
      );
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, vortexPayout)).toBe(parseUnits("1", 6));
      expect(submissionsOf(signedFeeTransfer)).toBe(1);

      const settlementSubsidies = await Subsidy.findAll({ where: { phase: "finalSettlementSubsidy", rampId: setup.rampId } });
      expect(settlementSubsidies).toHaveLength(1);
      expect(Number(settlementSubsidies[0].amount)).toBeCloseTo(9.431953, 6);
    },
    30000
  );

  it("partner subsidy cap: returns the best executable quote below the target", async () => {
    world.alfredpay.offrampRate = 16.9;
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.0093,
      targetDiscount: 0.0015
    });

    const warning = spyOn(logger, "warn");
    try {
      const quote = await createQuoteViaApi("1000");
      const metadata = await getAlfredpayMetadata(quote.id);
      expect(quote.outputAmount).toBe("17023.50");
      expect(metadata.inputAmountRaw).toBe(parseUnits("1008.31395", 6).toString());
      expect(metadata.subsidyAmountRaw).toBe(parseUnits("9.31395", 6).toString());
      expect(Number(metadata.outputAmountDecimal)).toBeCloseTo(17023.505755, 6);
      expect(Number(metadata.pricing.customer.referenceDifferenceBps)).toBeCloseTo(13.8269147, 6);
      expect(Number(metadata.pricing.customer.referenceDifferenceBps)).toBeLessThan(15);
      expect(warning).toHaveBeenCalledWith(
        "ALFREDPAY_OFFRAMP_TARGET_DISCOUNT_CAPPED",
        expect.objectContaining({
          allowedSubsidyUsd: "9.31395",
          appliedSubsidyUsd: "9.31395",
          capReason: "partner",
          deliveredOutput: "17023.505755",
          requestedTargetOutput: "17025.5",
          requiredSubsidyIsLowerBound: false
        })
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("runtime subsidy cap: returns and settles the best quote at exactly ten USDT", async () => {
    world.alfredpay.offrampRate = 16.9;
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      maxSubsidy: 0.1,
      targetDiscount: 0.02
    });

    const warning = spyOn(logger, "warn");
    let setup!: CorridorSetup;
    try {
      setup = await setUpRegisteredRamp("1000");
      const metadata = await getAlfredpayMetadata(setup.quoteId);
      expect(setup.quoteOutputAmount).toBe("17052.00");
      expect(metadata.inputAmountRaw).toBe(parseUnits("1010", 6).toString());
      expect(metadata.subsidyAmountRaw).toBe(parseUnits("10", 6).toString());
      expect(Number(metadata.pricing.customer.referenceDifferenceBps)).toBeLessThan(200);
      expect(warning).toHaveBeenCalledWith(
        "ALFREDPAY_OFFRAMP_TARGET_DISCOUNT_CAPPED",
        expect.objectContaining({
          allowedSubsidyUsd: "10",
          appliedSubsidyUsd: "10",
          capReason: "runtime",
          deliveredOutput: "17052",
          requestedTargetOutput: "17340"
        })
      );
    } finally {
      warning.mockRestore();
    }

    scriptHappyWorld(setup);
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, parseUnits("1000", 6));
    const fundingAddress = getEvmFundingAccount(Networks.Polygon).address;
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, fundingAddress, parseUnits("10", 6));
    const depositAddress = world.alfredpay.offrampDepositAddress;

    await processRampWithoutCompletionEmail(setup.rampId);

    expect((await RampState.findByPk(setup.rampId))?.currentPhase).toBe("complete");
    expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(parseUnits("1010", 6));
    const settlementSubsidies = await Subsidy.findAll({ where: { phase: "finalSettlementSubsidy", rampId: setup.rampId } });
    expect(settlementSubsidies).toHaveLength(1);
    expect(Number(settlementSubsidies[0].amount)).toBe(10);
  });

  it("provider maximum: falls back to the best fixed-input quote instead of rejecting", async () => {
    world.alfredpay.offrampRate = 16.9;
    world.alfredpay.offrampMaxFromAmount = "1000";
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.1,
      targetDiscount: 0.02
    });

    const warning = spyOn(logger, "warn");
    try {
      const quote = await createQuoteViaApi("1000");
      const metadata = await getAlfredpayMetadata(quote.id);
      expect(quote.outputAmount).toBe("16883.00");
      expect(metadata.inputAmountRaw).toBe(parseUnits("1000", 6).toString());
      expect(metadata.subsidyAmountRaw).toBe(parseUnits("1", 6).toString());
      expect(warning).toHaveBeenCalledWith(
        "ALFREDPAY_OFFRAMP_TARGET_DISCOUNT_CAPPED",
        expect.objectContaining({
          appliedSubsidyUsd: "1",
          capReason: "provider",
          providerMaximumInput: "1000",
          requiredSubsidyIsLowerBound: true,
          requiredSubsidyUsd: "1"
        })
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("rejects when the provider maximum cannot cover the fee-net baseline input", async () => {
    world.alfredpay.offrampRate = 16.9;
    world.alfredpay.offrampMaxFromAmount = "998";
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.1,
      targetDiscount: 0.02
    });
    const quoteCount = await QuoteTicket.count();

    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: Networks.Polygon,
        inputAmount: "1000",
        inputCurrency: EvmToken.USDT,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: "spei"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(response.status).not.toBe(201);
    expect(await QuoteTicket.count()).toBe(quoteCount);
  });

  it("favorable provider pricing returns the natural upside without a subsidy", async () => {
    world.alfredpay.offrampRate = 20;
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.1,
      targetDiscount: 0.0015
    });

    const quote = await createQuoteViaApi("1000");
    const metadata = await getAlfredpayMetadata(quote.id);
    expect(quote.outputAmount).toBe("19963.00");
    expect(metadata.inputAmountRaw).toBe(parseUnits("999", 6).toString());
    expect(metadata.subsidyAmountRaw).toBe("0");
    expect(Number(metadata.pricing.customer.referenceDifferenceBps)).toBeGreaterThan(15);
  });

  it("zero target discount leaves provider spread and fees unsubsidized", async () => {
    world.alfredpay.offrampRate = 16.9;
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.1,
      targetDiscount: 0
    });

    const quote = await createQuoteViaApi("1000");
    const metadata = await getAlfredpayMetadata(quote.id);
    expect(quote.outputAmount).toBe("16866.10");
    expect(metadata.inputAmountRaw).toBe(parseUnits("999", 6).toString());
    expect(metadata.subsidyAmountRaw).toBe("0");
  });

  it("regression: negative target discount subsidizes up to its worse-than-reference rate floor", async () => {
    world.alfredpay.offrampRate = 16.7;
    world.alfredpay.quoteFees = [{ amount: "17", currency: "MXN", type: AlfredpayFeeType.PROCESSING_FEE }];
    await updatePartnerPricing("vortex", RampDirection.SELL, {
      markupCurrency: FiatToken.MXN,
      markupType: "absolute",
      markupValue: 17,
      maxSubsidy: 0.1,
      targetDiscount: -0.01
    });

    const quote = await createQuoteViaApi("1000");
    const metadata = await getAlfredpayMetadata(quote.id);
    // Target: 1000 USD * 17 * (1 - 0.01) = 16830 MXN — worse than the 17000 reference,
    // but above the unsubsidized 16666.30, so the provider deposit is topped up:
    // fromAmount = (16830 + 17) / 16.7 = 1008.802396 USDT.
    expect(quote.outputAmount).toBe("16830.00");
    expect(metadata.inputAmountRaw).toBe(parseUnits("1008.802396", 6).toString());
    expect(metadata.subsidyAmountRaw).toBe(parseUnits("9.802396", 6).toString());
    expect(Number(metadata.adjustedTargetDiscount)).toBe(-0.01);
  });

  it(
    "ambiguous funding failure: an RPC outage pauses the ramp for reconciliation",
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

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("fundEphemeral");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });

      // The transport error is recoverable at the phase layer, but the
      // financial outcome is unknown, so retries halt instead of risking a
      // duplicate funding transfer.
      const outageLogs = final?.errorLogs.filter(log => log.error.includes("Error funding ephemeral account")) ?? [];
      expect(outageLogs.length).toBe(1);
      expect(outageLogs.every(log => log.phase === "fundEphemeral" && log.recoverable === true)).toBe(true);
      expect(final?.errorLogs.some(log => log.error.includes("requires reconciliation"))).toBe(true);
      expect(await FinancialOperation.findOne({ where: { phase: "fundEphemeral", scopeId: setup.rampId } })).toMatchObject({
        status: "unknown"
      });
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(0n);
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

      await processRampWithoutCompletionEmail(setup.rampId);

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
    "settlement cap: bridge slippage inside the delivery gate is funded, not halted",
    async () => {
      const setup = await setUpRegisteredRamp("1000");
      const metadata = await getAlfredpayMetadata(setup.quoteId);
      expect(metadata.subsidyAmountRaw).toBe("0");
      scriptHappyWorld(setup);
      world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
      const fundingAddress = getEvmFundingAccount(Networks.Polygon).address;
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, fundingAddress, parseUnits("10", 6));
      // Squid delivered 5 USDT less than the estimate it was quoted from. The delivery gate
      // already accepts a shortfall this size, so settlement must fund it rather than stall a
      // ramp whose provider order is bound to the full quoted deposit.
      const shortfall = parseUnits("5", 6);
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        setup.ephemeral.address,
        BigInt(metadata.bridgeOutputAmountRaw) - shortfall
      );

      await processRampWithoutCompletionEmail(setup.rampId);

      expect((await RampState.findByPk(setup.rampId))?.currentPhase).toBe("complete");
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, world.alfredpay.offrampDepositAddress)).toBe(
        BigInt(metadata.inputAmountRaw)
      );
      const settlementSubsidies = await Subsidy.findAll({ where: { phase: "finalSettlementSubsidy", rampId: setup.rampId } });
      expect(settlementSubsidies).toHaveLength(1);
      expect(Number(settlementSubsidies[0].amount)).toBe(5);
    },
    30000
  );

  it(
    "settlement cap: a shortfall above the absolute cap still refuses treasury funding",
    async () => {
      const setup = await setUpRegisteredRamp("1000");
      const metadata = await getAlfredpayMetadata(setup.quoteId);
      world.evm.setNativeBalance(Networks.Polygon, setup.ephemeral.address, parseUnits("2", 18));
      const fundingAddress = getEvmFundingAccount(Networks.Polygon).address;
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, fundingAddress, parseUnits("100", 6));
      // 50 USDT short: still inside the delivery gate, but far above
      // MAX_FINAL_SETTLEMENT_SUBSIDY_USD, which remains the absolute treasury bound.
      world.evm.setErc20Balance(
        Networks.Polygon,
        ALFREDPAY_ERC20_TOKEN,
        setup.ephemeral.address,
        BigInt(metadata.bridgeOutputAmountRaw) - parseUnits("50", 6)
      );

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.errorLogs.some(log => log.error.includes("exceeds maximum allowed"))).toBe(true);

      // The deposit transfer never reached the chain and treasury sent nothing.
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, world.alfredpay.offrampDepositAddress)).toBe(0n);
      const settlementSubsidies = await Subsidy.findAll({ where: { phase: "finalSettlementSubsidy", rampId: setup.rampId } });
      expect(settlementSubsidies).toHaveLength(0);
    },
    30000
  );

  it(
    "unrecoverable failure: an Alfredpay FAILED order status fails the ramp during the transfer phase",
    async () => {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FAILED;

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("failed");
      expect(final?.processingLock).toEqual({ locked: false, lockedAt: null });
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address)).toBe(
        setup.inputAmountRaw
      );
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, world.alfredpay.offrampDepositAddress)).toBe(0n);
    },
    30000
  );

  it("does not deposit into an order whose provider lifecycle is already advanced", async () => {
    for (const status of [
      AlfredpayOfframpStatus.ON_CHAIN_DEPOSIT_RECEIVED,
      AlfredpayOfframpStatus.TRADE_COMPLETED,
      AlfredpayOfframpStatus.FIAT_TRANSFER_INITIATED,
      AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED
    ]) {
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      world.alfredpay.offrampStatus = status;
      const registered = await RampState.findByPk(setup.rampId);
      expect(registered).toBeDefined();
      const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
        executePhase(state: RampState): Promise<RampState>;
      };

      await expect(executor.executePhase(registered as RampState)).rejects.toThrow(
        `is already ${status} without a confirmed local transfer`
      );
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address)).toBe(
        setup.inputAmountRaw
      );
    }
  });

  it(
    "expired-order recovery keeps the provider origin bound to the depositing ephemeral",
    async () => {
      world.alfredpay.nextOfframpTransactionId = "123e4567-e89b-12d3-a456-426614174000";
      const setup = await setUpRegisteredRamp();
      scriptHappyWorld(setup);
      const orderCount = world.alfredpay.offrampOrders.length;
      const registered = await RampState.findByPk(setup.rampId);
      const transactionId = registered?.state.alfredpayTransactionId;
      expect(transactionId).toBeTruthy();
      const transaction = world.alfredpay.offrampTransactions.get(transactionId ?? "");
      expect(transaction).toBeDefined();
      if (transaction) transaction.expiration = new Date(0).toISOString();

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("complete");
      expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
      expect(world.alfredpay.offrampOrders.at(-1)?.originAddress).toBe(setup.ephemeral.address);
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
      const recoveryOperation = await FinancialOperation.findOne({
        where: { phase: "alfredpayOfframpTransfer", provider: "alfredpay", scopeId: setup.rampId }
      });
      expect(recoveryOperation).toMatchObject({ externalId: expect.any(String), status: "confirmed" });
      expect(recoveryOperation?.attemptClass.startsWith("alfredpay-recovery:")).toBe(true);
      expect(recoveryOperation?.attemptClass.length).toBeLessThanOrEqual(64);
    },
    30000
  );

  it("replays a confirmed replacement before inspecting the stale order after a persistence crash", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    const transactionId = registered?.state.alfredpayTransactionId;
    const transaction = world.alfredpay.offrampTransactions.get(transactionId ?? "");
    expect(transaction).toBeDefined();
    if (!registered || !transaction) throw new Error("missing registered Alfredpay recovery fixture");
    transaction.expiration = new Date(0).toISOString();
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    const originalTransactionId = transaction.transactionId;
    const originalUpdate = registered.update.bind(registered);
    let crashed = false;
    registered.update = mock(async values => {
      const nextTransactionId = (values.state as typeof registered.state | undefined)?.alfredpayTransactionId;
      if (!crashed && nextTransactionId && nextTransactionId !== originalTransactionId) {
        crashed = true;
        throw new Error("simulated crash before replacement id persistence");
      }
      return originalUpdate(values);
    }) as typeof registered.update;
    const orderCount = world.alfredpay.offrampOrders.length;
    try {
      await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });
    } finally {
      registered.update = originalUpdate as typeof registered.update;
    }
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    const replacementTransactionId = world.alfredpay.offrampTransactions.keys().toArray().at(-1);
    expect(replacementTransactionId).toBeTruthy();
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);

    // The stale order is now FAILED. The confirmed replacement journal must
    // replay before this mutable response can incorrectly fail the ramp.
    world.alfredpay.offrampStatusOverrides.set(originalTransactionId, AlfredpayOfframpStatus.FAILED);
    await executor.executePhase(registered);

    expect(registered.state.alfredpayTransactionId).toBe(replacementTransactionId);
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
  });

  it("does not rebind or fund a confirmed replacement whose create status is already advanced", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay replacement-status fixture");
    const originalTransactionId = registered.state.alfredpayTransactionId as string;
    const transaction = world.alfredpay.offrampTransactions.get(originalTransactionId);
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.nextOfframpOrderStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_INITIATED;
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toThrow("is already FIAT_TRANSFER_INITIATED");
    await expect(executor.executePhase(registered)).rejects.toThrow("is already FIAT_TRANSFER_INITIATED");

    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });

  it("does not rebind or fund a confirmed replacement whose reread status is already advanced", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay replacement-reread fixture");
    const originalTransactionId = registered.state.alfredpayTransactionId as string;
    const transaction = world.alfredpay.offrampTransactions.get(originalTransactionId);
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.nextOfframpRereadStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_INITIATED;
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toThrow("is already FIAT_TRANSFER_INITIATED");
    await expect(executor.executePhase(registered)).rejects.toThrow("is already FIAT_TRANSFER_INITIATED");

    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });

  it("fails without funding when a confirmed replacement reread reports FAILED", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay failed-replacement fixture");
    const originalTransactionId = registered.state.alfredpayTransactionId as string;
    const transaction = world.alfredpay.offrampTransactions.get(originalTransactionId);
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.nextOfframpRereadStatus = AlfredpayOfframpStatus.FAILED;
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    const first = await executor.executePhase(registered);
    const second = await executor.executePhase(registered);

    expect(first.currentPhase).toBe("failed");
    expect(second.currentPhase).toBe("failed");
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });

  it(
    "expired-order recovery retries a proven-safe rejection after provider terms improve",
    async () => {
      world.alfredpay.offrampRate = 16.9;
      await updatePartnerPricing("vortex", RampDirection.SELL, {
        maxSubsidy: 0.0095,
        targetDiscount: 0.0015
      });
      const setup = await setUpRegisteredRamp("1000");
      const orderCount = world.alfredpay.offrampOrders.length;
      const registered = await RampState.findByPk(setup.rampId);
      const transactionId = registered?.state.alfredpayTransactionId;
      expect(transactionId).toBeTruthy();
      const transaction = world.alfredpay.offrampTransactions.get(transactionId ?? "");
      expect(transaction).toBeDefined();
      if (transaction) transaction.expiration = new Date(0).toISOString();
      world.alfredpay.offrampRate = 16;

      const fundingAddress = getEvmFundingAccount(Networks.Polygon).address;
      const principalRaw = parseUnits("1000", 6);
      scriptHappyWorld(setup);
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, principalRaw);
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, fundingAddress, parseUnits("10", 6));
      world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.userWallet.address, 0n);

      await processRampWithoutCompletionEmail(setup.rampId);

      const final = await RampState.findByPk(setup.rampId);
      expect(final?.currentPhase).toBe("alfredpayOfframpTransfer");
      expect(world.alfredpay.offrampOrders).toHaveLength(orderCount);
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, world.alfredpay.offrampDepositAddress)).toBe(0n);
      expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address)).toBe(
        setup.inputAmountRaw
      );
      expect(final?.errorLogs.some(log => log.error.includes("no replacement order can preserve"))).toBe(true);

      world.alfredpay.offrampRate = 16.9;
      const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
        executePhase(state: RampState): Promise<RampState>;
      };
      await executor.executePhase(final as RampState);
      expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
      expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
    },
    30000
  );

  it("recovers from immutable terms after a drifted live order expires", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay drift fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    const immutableDeposit = transaction.depositAddress;
    transaction.depositAddress = privateKeyToAccount(generatePrivateKey()).address;
    transaction.toAmount = "0";
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);

    transaction.expiration = new Date(0).toISOString();
    const orderCount = world.alfredpay.offrampOrders.length;
    await executor.executePhase(registered);
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(world.alfredpay.offrampOrders.at(-1)?.customerId).toBe(registered.state.alfredpayUserId);
    expect(world.alfredpay.offrampDepositAddress).toBe(immutableDeposit);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
  });

  it("uses canonical block facts when compatibility identity projections drift", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay canonical-identity fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay canonical-identity transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    const canonicalFacts = registered.state.blockState?.alfredpayOfframp as
      | { alfredpayUserId?: string; fiatAccountId?: string }
      | undefined;
    expect(canonicalFacts?.alfredpayUserId).toBeTruthy();
    expect(canonicalFacts?.fiatAccountId).toBeTruthy();
    await registered.update({
      state: {
        ...registered.state,
        alfredpayUserId: "drifted-compatibility-customer",
        fiatAccountId: "drifted-compatibility-account"
      }
    });
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await executor.executePhase(registered);

    const replacement = world.alfredpay.offrampOrders.at(-1);
    expect(replacement?.customerId).toBe(canonicalFacts?.alfredpayUserId);
    expect(replacement?.fiatAccountId).toBe(canonicalFacts?.fiatAccountId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
  });

  it("rejects a wrong-chain recovery quote before creating a replacement order", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay recovery-chain fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay recovery-chain transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.nextOfframpQuoteChain = AlfredpayChain.ETH;
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });

  it("replays a confirmed provider transfer before inspecting mutable provider terms", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay transfer fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");

    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    const originalUpdate = registered.update.bind(registered);
    registered.update = mock(async () => {
      throw new Error("simulated crash before provider transfer hash persistence");
    }) as typeof registered.update;
    try {
      await expect(executor.executePhase(registered)).rejects.toThrow("simulated crash");
    } finally {
      registered.update = originalUpdate as typeof registered.update;
    }
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);

    // The transfer has already consumed the ephemeral balance. Even if the
    // provider's mutable response now drifts and expires, journal replay must
    // persist the deterministic main-transfer hash before any new recovery.
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, setup.ephemeral.address, 0n);
    transaction.expiration = new Date(0).toISOString();
    transaction.toAmount = "0";
    const orderCount = world.alfredpay.offrampOrders.length;
    await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });

    const replayed = await RampState.findByPk(setup.rampId);
    expect(replayed?.state.alfredpayOfframpTransferTxHash).toBeTruthy();
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount);
  });

  it("replaces a provider order that cannot safely outlive broadcast and indexing", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay lifetime fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    transaction.expiration = new Date(Date.now() + 30_000).toISOString();
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await executor.executePhase(registered);

    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(1);
  });

  it("does not fund a replacement order whose remaining lifetime is unsafe", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay expiration fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    const originalTransactionId = transaction.transactionId;
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.nextOfframpExpiration = "not-a-valid-date";
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);

    await expect(executor.executePhase(registered)).rejects.toMatchObject({ isRecoverable: true });
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(registered.state.alfredpayTransactionId).toBe(originalTransactionId);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });

  it("reconciles a confirmed replacement that changes the immutable deposit instead of creating duplicates", async () => {
    const setup = await setUpRegisteredRamp();
    scriptHappyWorld(setup);
    const registered = await RampState.findByPk(setup.rampId);
    expect(registered).toBeDefined();
    if (!registered) throw new Error("missing registered Alfredpay replacement fixture");
    const transaction = world.alfredpay.offrampTransactions.get(registered.state.alfredpayTransactionId ?? "");
    expect(transaction).toBeDefined();
    if (!transaction) throw new Error("missing Alfredpay transaction fixture");
    transaction.expiration = new Date(0).toISOString();
    world.alfredpay.offrampDepositAddress = privateKeyToAccount(generatePrivateKey()).address;
    const orderCount = world.alfredpay.offrampOrders.length;
    const executor = new AlfredpayOfframpTransferExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };

    await expect(executor.executePhase(registered)).rejects.toThrow("does not match immutable terms");
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);

    await expect(executor.executePhase(registered)).rejects.toThrow("does not match immutable terms");
    expect(world.alfredpay.offrampOrders).toHaveLength(orderCount + 1);
    expect(submissionsOf(setup.signedOfframpTransfer)).toBe(0);
  });
});
