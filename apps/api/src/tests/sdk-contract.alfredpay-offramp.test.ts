import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredPayCountry,
  AlfredpayFiatAccountType,
  AlfredpayOfframpStatus,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  type GetRampStatusResponse,
  Networks,
  RampDirection,
  type UnsignedTx
} from "@vortexfi/shared";
import { BaseError, ContractFunctionExecutionError, decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { VortexSdk } from "../../../../packages/sdk/src";
import type ProviderCustomer from "../models/providerCustomer.model";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestAlfredpayCustomer, createTestApiKey, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POLYGON_CHAIN_ID_HEX = "0x89"; // 137

interface CurrencyCase {
  fiat: FiatToken;
  /** Alfredpay-side currency code expected on created orders. */
  alfredpayCurrency: string;
  country: AlfredPayCountry;
  /** Quote destination string (payment rail). */
  rail: EPaymentMethod;
  /** USDT amount for the SELL quote (within the per-currency limits). */
  inputAmount: string;
  /** Fiat the fake anchor pays out per USDT. */
  offrampRate: number;
}

interface LifecycleCase extends CurrencyCase {
  /** The user's payout account served by the fake anchor's listFiatAccounts. */
  fiatAccount: {
    fiatAccountId: string;
    type: AlfredpayFiatAccountType;
    accountNumber: string;
    accountType: string;
  };
}

// The full lifecycle runs once per Alfredpay currency with its own SDK test.
// Rails per currency: USD and COP pay out over ach, ARS over cbu, MXN over
// spei (100 USDT * 20 = 2000 MXN, the same legible flat rate the MXN corridor
// scenario uses; the other rates mirror the FakePrices feeds). Each case
// seeds the payout-account shape the anchor serves for that country: US ACH
// bank accounts, MXN SPEI/CLABE, Colombian ACH accounts, Argentine
// COELSA/CBU.
const FULL_LIFECYCLE_CASES: LifecycleCase[] = [
  {
    alfredpayCurrency: "USD",
    country: AlfredPayCountry.US,
    fiat: FiatToken.USD,
    fiatAccount: {
      accountNumber: "021000021000000",
      accountType: "checking",
      fiatAccountId: "fiat-account-usd-1",
      type: AlfredpayFiatAccountType.ACH
    },
    inputAmount: "5",
    offrampRate: 1,
    rail: EPaymentMethod.ACH
  },
  {
    alfredpayCurrency: "MXN",
    country: AlfredPayCountry.MX,
    fiat: FiatToken.MXN,
    fiatAccount: {
      accountNumber: "002010077777777771", // CLABE
      accountType: "clabe",
      fiatAccountId: "fiat-account-mxn-1",
      type: AlfredpayFiatAccountType.SPEI
    },
    inputAmount: "100",
    offrampRate: 20,
    rail: EPaymentMethod.SPEI
  },
  {
    alfredpayCurrency: "COP",
    country: AlfredPayCountry.CO,
    fiat: FiatToken.COP,
    fiatAccount: {
      accountNumber: "0110123456789",
      accountType: "savings",
      fiatAccountId: "fiat-account-cop-1",
      type: AlfredpayFiatAccountType.ACH
    },
    inputAmount: "100",
    offrampRate: 4000,
    rail: EPaymentMethod.ACH
  },
  {
    alfredpayCurrency: "ARS",
    country: AlfredPayCountry.AR,
    fiat: FiatToken.ARS,
    fiatAccount: {
      accountNumber: "2850590940090418135201", // CBU
      accountType: "cbu",
      fiatAccountId: "fiat-account-ars-1",
      type: AlfredpayFiatAccountType.COELSA
    },
    inputAmount: "100",
    offrampRate: 1000,
    rail: EPaymentMethod.CBU
  }
];

/**
 * Same shim as the other SDK contract tests: the SDK's viem wallet client
 * issues one eth_chainId RPC before signing locally. The Alfredpay SELL
 * corridor only ephemeral-signs on Polygon (the source-of-funds transfer is
 * user-broadcast, never SDK-signed), so answer with the Polygon chain id.
 */
function installChainIdShim(): { restore: () => void } {
  const guardedFetch = globalThis.fetch;
  const shim = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof init?.body === "string") {
      try {
        const payload = JSON.parse(init.body) as { id?: number; method?: string };
        if (payload.method === "eth_chainId") {
          return Response.json({ id: payload.id ?? 1, jsonrpc: "2.0", result: POLYGON_CHAIN_ID_HEX });
        }
      } catch {
        // not JSON — let the guarded fetch decide
      }
    }
    return guardedFetch(input, init);
  }) as typeof fetch;
  globalThis.fetch = Object.assign(shim, guardedFetch);
  return {
    restore: () => {
      globalThis.fetch = guardedFetch;
    }
  };
}

/**
 * SDK ↔ API contract tests for the Alfredpay SELL rail (USDT on Polygon →
 * USD/MXN/COP/ARS bank payouts): the real SDK lists the user's registered
 * fiat accounts, registers the offramp on the no-permit path (fiatAccountId +
 * walletAddress), broadcasts the user's source-of-funds transfer via
 * submitUserTransactions, and drives the ramp to completion — the full
 * lifecycle runs once per currency: USD/ach, MXN/spei, COP/ach and ARS/cbu.
 */
describe("SDK ↔ API contract (Alfredpay offramps, USDT on Polygon → bank payout)", () => {
  let world: FakeWorld;
  let chainIdShim: { restore: () => void };
  let app: TestApp;

  beforeAll(async () => {
    world = installFakeWorld();
    chainIdShim = installChainIdShim();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    chainIdShim?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.alfredpay.offrampStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED;
    // Fresh deposit address per test: the in-memory EVM ledger persists across
    // tests, so a shared address would accumulate balances between scenarios.
    world.alfredpay.offrampDepositAddress = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    // Polygon USDT has no EIP-2612 support: the nonces() probe fails as a
    // contract-call error, steering registration onto the no-permit path where
    // the user broadcasts a plain transfer from their own wallet.
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

  /** A user with a completed Alfredpay KYC profile and an SDK authenticated via their secret key. */
  async function createUserSdk(country: AlfredPayCountry): Promise<{
    sdk: VortexSdk;
    userId: string;
    customer: ProviderCustomer;
  }> {
    const user = await createTestUser();
    const customer = await createTestAlfredpayCustomer(user.id, { country });
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const sdk = new VortexSdk({ apiBaseUrl: app.baseUrl, secretKey: plaintextKey, storeEphemeralKeys: false });
    return { customer, sdk, userId: user.id };
  }

  function quoteRequest(currency: CurrencyCase) {
    return {
      from: Networks.Polygon,
      inputAmount: currency.inputAmount,
      inputCurrency: EvmToken.USDT,
      network: Networks.Polygon,
      outputCurrency: currency.fiat,
      rampType: RampDirection.SELL,
      to: currency.rail
    } as const;
  }

  /** Funds the wallet's USDT so the SDK's offramp balance preflight passes against the fake ledger. */
  function fundWallet(walletAddress: string, inputAmount: string): void {
    world.evm.setErc20Balance(
      Networks.Polygon,
      ALFREDPAY_ERC20_TOKEN,
      walletAddress,
      parseUnits(inputAmount, ALFREDPAY_ERC20_DECIMALS)
    );
  }

  /** Broadcasts a user transaction from the wallet on its source chain, as a real wallet would. */
  function sendFromWallet(walletAddress: string) {
    return async (txData: { to: string; data?: string; value?: string }, context: { unsignedTransaction: UnsignedTx }) =>
      world.evm.broadcastUserTransaction(context.unsignedTransaction.network, walletAddress, {
        data: txData.data,
        to: txData.to,
        value: BigInt(txData.value ?? "0")
      });
  }

  /** Scripts gas + the arrived user deposit on the ephemeral and applies raw ERC-20 transfers to the ledger. */
  async function scriptHappyWorld(rampId: string, quoteId: string): Promise<{ inputAmountRaw: bigint }> {
    const state = await RampState.findByPk(rampId);
    const quote = await QuoteTicket.findByPk(quoteId);
    const ephemeralAddress = state?.state.evmEphemeralAddress as `0x${string}`;
    expect(ephemeralAddress).toBeTruthy();
    const inputAmountRaw = BigInt(quote?.metadata.alfredpayOfframp?.inputAmountRaw ?? "0");
    expect(inputAmountRaw).toBeGreaterThan(0n);

    world.evm.setNativeBalance(Networks.Polygon, ephemeralAddress, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeralAddress, inputAmountRaw);
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
    return { inputAmountRaw };
  }

  /** Polls getRampStatus (itself part of the contract) until the ramp completes. */
  async function waitForComplete(sdk: VortexSdk, rampId: string): Promise<GetRampStatusResponse> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const status = await sdk.getRampStatus(rampId);
      if (status.currentPhase === "complete") {
        return status;
      }
      const state = await RampState.findByPk(rampId);
      if (state?.currentPhase === "failed") {
        throw new Error(`Ramp ${rampId} failed: ${JSON.stringify(state.errorLogs)}`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ramp ${rampId} to complete (phase: ${status.currentPhase})`);
      }
      await Bun.sleep(50);
    }
  }

  for (const currency of FULL_LIFECYCLE_CASES) {
    it(
      `drives the full ${currency.fiat}/${currency.rail} lifecycle: createQuote → listAlfredpayFiatAccounts → registerRamp → submitUserTransactions → startRamp → complete`,
      async () => {
        world.alfredpay.offrampRate = currency.offrampRate;
        const { customer, sdk, userId } = await createUserSdk(currency.country);

        // The frontend-SDK flow picks the payout destination from the user's
        // fiat accounts registered with the anchor.
        world.alfredpay.fiatAccountsByCustomer.set(customer.providerCustomerId as string, [
          { ...currency.fiatAccount, customerId: customer.providerCustomerId as string }
        ]);
        const accounts = await sdk.listAlfredpayFiatAccounts(currency.country);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].type).toBe(currency.fiatAccount.type);
        const fiatAccountId = accounts[0].fiatAccountId;
        expect(fiatAccountId).toBe(currency.fiatAccount.fiatAccountId);

        const wallet = privateKeyToAccount(generatePrivateKey());
        fundWallet(wallet.address, currency.inputAmount);

        // Quote contract: the rail and currency mapping the SDK promises.
        const quote = await sdk.createQuote(quoteRequest(currency));
        expect(quote.id).toMatch(UUID_PATTERN);
        expect(quote.rampType).toBe(RampDirection.SELL);
        expect(quote.from).toBe(Networks.Polygon);
        expect(quote.to).toBe(currency.rail);
        expect(quote.network).toBe(Networks.Polygon);
        expect(quote.inputCurrency).toBe(EvmToken.USDT);
        expect(Number(quote.inputAmount)).toBe(Number(currency.inputAmount));
        expect(quote.outputCurrency).toBe(currency.fiat);
        expect(Number(quote.outputAmount)).toBeGreaterThan(0);
        expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());

        // registerRamp SELL contract on the no-permit path: exactly one
        // user-wallet transaction comes back — the plain USDT transfer to the
        // ephemeral — classified as a broadcastable EVM tx.
        const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
          fiatAccountId,
          walletAddress: wallet.address
        });
        expect(rampProcess.id).toMatch(UUID_PATTERN);
        expect(rampProcess.quoteId).toBe(quote.id);
        expect(rampProcess.type).toBe(RampDirection.SELL);
        expect(rampProcess.currentPhase).toBe("initial");
        expect(unsignedTransactions).toHaveLength(1);
        const userTx = unsignedTransactions[0];
        expect(userTx.phase).toBe("squidRouterNoPermitTransfer");
        expect(userTx.network).toBe(Networks.Polygon);
        expect(userTx.signer.toLowerCase()).toBe(wallet.address.toLowerCase());
        expect(sdk.getUserTransactionType(userTx)).toBe("evm-transaction");
        const broadcastable = sdk.getTransactionToBroadcast(userTx);
        expect(broadcastable.to.toLowerCase()).toBe(ALFREDPAY_ERC20_TOKEN.toLowerCase());
        expect(broadcastable.data).toBeTruthy();

        // The SDK already signed and stored the ephemeral's Polygon-side txs;
        // registration created the anchor order on the no-permit path.
        const stored = await RampState.findByPk(rampProcess.id);
        expect(stored?.userId).toBe(userId);
        expect(stored?.state.alfredpayTransactionId).toBeTruthy();
        expect(stored?.state.isNoPermitFallback).toBe(true);
        const presignedPhases = (stored?.presignedTxs ?? []).map(tx => tx.phase);
        expect(presignedPhases).toContain("alfredpayOfframpTransfer");
        // The user-wallet transfer must never be presigned by the ephemeral.
        expect(presignedPhases).not.toContain("squidRouterNoPermitTransfer");

        // submitUserTransactions broadcasts through the caller's wallet handler
        // and reports the hash to the API.
        const afterSubmit = await sdk.submitUserTransactions(rampProcess.id, unsignedTransactions, {
          sendTransaction: sendFromWallet(wallet.address)
        });
        expect(afterSubmit.id).toBe(rampProcess.id);
        const withHash = await RampState.findByPk(rampProcess.id);
        expect(withHash?.state.squidRouterNoPermitTransferHash).toBeTruthy();

        const { inputAmountRaw } = await scriptHappyWorld(rampProcess.id, quote.id);
        const depositAddress = world.alfredpay.offrampDepositAddress;
        const started = await sdk.startRamp(rampProcess.id);
        expect(started.id).toBe(rampProcess.id);

        const status = await waitForComplete(sdk, rampProcess.id);
        expect(status.type).toBe(RampDirection.SELL);
        expect(Number(status.inputAmount)).toBe(Number(quote.inputAmount));
        expect(Number(status.outputAmount)).toBe(Number(quote.outputAmount));

        // End to end, the anchor's deposit address received the full USDT and
        // the order maps USDT → this currency against the chosen fiat account.
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, depositAddress)).toBe(inputAmountRaw);
        const order = world.alfredpay.offrampOrders[world.alfredpay.offrampOrders.length - 1];
        expect(order.fromCurrency).toBe("USDT" as never);
        expect(order.toCurrency).toBe(currency.alfredpayCurrency as never);
        expect(order.fiatAccountId).toBe(fiatAccountId);
      },
      30000
    );
  }
});
