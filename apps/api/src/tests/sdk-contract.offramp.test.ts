import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  AlfredPayCountry,
  AlfredpayFiatAccountType,
  AveniaTicketStatus,
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  type GetRampStatusResponse,
  Networks,
  type RampPhase,
  RampDirection,
  type UnsignedTx
} from "@vortexfi/shared";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { VortexSdk } from "../../../../packages/sdk/src";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import {
  createTestAlfredpayCustomer,
  createTestApiKey,
  createTestTaxId,
  createTestUser,
  updatePartnerPricing
} from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

function requireToken(network: Networks.Base | Networks.Polygon, token: EvmToken) {
  const details = evmTokenConfig[network][token];
  if (!details) {
    throw new Error(`${token} token config missing for ${network}`);
  }
  return details;
}
const USDC_ON_BASE = requireToken(Networks.Base, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const USDC_ON_POLYGON = requireToken(Networks.Polygon, EvmToken.USDC).erc20AddressSourceChain as `0x${string}`;
const BRLA_ON_BASE = requireToken(Networks.Base, EvmToken.BRLA).erc20AddressSourceChain as `0x${string}`;

const TAX_ID = "12345678901";
const RECEIVER_TAX_ID = "12345678900";
const PIX_KEY = "test-pix-key";
const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

/**
 * Same shim as sdk-contract.test.ts: the SDK's viem wallet client issues one
 * eth_chainId RPC before signing locally; the SELL corridor only ephemeral-signs
 * on Base (the Polygon squid leg is user-broadcast, never SDK-signed).
 */
function installChainIdShim(): { restore: () => void } {
  const guardedFetch = globalThis.fetch;
  const shim = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof init?.body === "string") {
      try {
        const payload = JSON.parse(init.body) as { id?: number; method?: string };
        if (payload.method === "eth_chainId") {
          return Response.json({ id: payload.id ?? 1, jsonrpc: "2.0", result: BASE_CHAIN_ID_HEX });
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
 * SDK ↔ API contract tests for the SELL direction and the user-transaction
 * surface: the real SDK registers a cross-chain BRL offramp (USDC on Polygon →
 * pix), classifies and submits the user-wallet squid transactions
 * (getUserTransactionType / getTransactionToBroadcast / submitUserTransactions
 * / submitUserTxHash), reports hashes via the typed updateRamp, and drives the
 * ramp to completion — plus getQuote and listAlfredpayFiatAccounts, which had
 * no contract coverage.
 */
describe("SDK ↔ API contract (BRL offramp, USDC on Polygon → pix)", () => {
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
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: "0x000000000000000000000000000000000000fee5" });
    world.evm.failNextSends = 0;
    world.evm.onTransaction = undefined;
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.brla.payoutTicketStatus = AveniaTicketStatus.PAID;
    world.brla.subaccountEvmWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    world.squidRouter.toTokenDecimals = 6;
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName === "quoteSwapExactTokensForTokens") {
        const amountIn = params.args?.[0] as bigint;
        return amountIn * 5n * 10n ** 12n;
      }
      return undefined;
    };
  });

  /** A KYC'd user with a user-linked secret key, and an SDK authenticated as them. */
  async function createUserSdk(): Promise<{ sdk: VortexSdk; userId: string }> {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const sdk = new VortexSdk({ apiBaseUrl: app.baseUrl, secretKey: plaintextKey, storeEphemeralKeys: false });
    return { sdk, userId: user.id };
  }

  function quoteRequest() {
    return {
      from: Networks.Polygon,
      inputAmount: "100",
      inputCurrency: EvmToken.USDC,
      network: Networks.Polygon,
      outputCurrency: FiatToken.BRL,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.PIX
    } as const;
  }

  /**
   * Registers a SELL ramp through the SDK for a wallet that holds enough USDC
   * on Polygon (the SDK's preflight reads the fake ledger).
   */
  async function registerOfframp(sdk: VortexSdk) {
    const wallet = privateKeyToAccount(generatePrivateKey());
    world.evm.setErc20Balance(Networks.Polygon, USDC_ON_POLYGON, wallet.address, parseUnits("100", 6));

    const quote = await sdk.createQuote(quoteRequest());
    const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
      pixDestination: PIX_KEY,
      receiverTaxId: RECEIVER_TAX_ID,
      walletAddress: wallet.address
    });
    return { quote, rampProcess, unsignedTransactions, wallet };
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

  /** Scripts gas + bridged USDC on Base and the swap/payout ledger effects for a registered ramp. */
  async function scriptHappyWorld(rampId: string, quoteId: string): Promise<{ swapOutputRaw: bigint }> {
    const state = await RampState.findByPk(rampId);
    const quote = await QuoteTicket.findByPk(quoteId);
    const ephemeralAddress = state?.state.evmEphemeralAddress as `0x${string}`;
    expect(ephemeralAddress).toBeTruthy();
    const swapInputRaw = BigInt(quote?.metadata.nablaSwapEvm?.inputAmountForSwapRaw ?? "0");
    const swapOutputRaw = BigInt(quote?.metadata.nablaSwapEvm?.outputAmountRaw ?? "0");
    expect(swapInputRaw).toBeGreaterThan(0n);
    expect(swapOutputRaw).toBeGreaterThan(0n);

    const signedNablaSwap = state?.presignedTxs?.find(tx => tx.phase === "nablaSwap")?.txData as `0x${string}`;
    const signedPayout = state?.presignedTxs?.find(tx => tx.phase === "brlaPayoutOnBase")?.txData as `0x${string}`;
    expect(signedNablaSwap).toBeTruthy();
    expect(signedPayout).toBeTruthy();

    world.evm.setNativeBalance(Networks.Base, ephemeralAddress, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, ephemeralAddress, swapInputRaw);
    world.evm.onTransaction = tx => {
      if (tx.serialized === signedNablaSwap) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, ephemeralAddress, swapOutputRaw);
        return;
      }
      if (tx.serialized === signedPayout) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet, swapOutputRaw);
      }
    };
    return { swapOutputRaw };
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

  it(
    "drives the full offramp lifecycle: createQuote → getQuote → registerRamp → submitUserTransactions → startRamp → complete",
    async () => {
      const { sdk, userId } = await createUserSdk();
      const { quote, rampProcess, unsignedTransactions, wallet } = await registerOfframp(sdk);

      // getQuote contract: fetching the quote by id returns the created quote.
      const fetched = await sdk.getQuote(quote.id);
      expect(fetched.id).toBe(quote.id);
      expect(fetched.rampType).toBe(RampDirection.SELL);
      expect(Number(fetched.inputAmount)).toBe(Number(quote.inputAmount));
      expect(Number(fetched.outputAmount)).toBe(Number(quote.outputAmount));
      expect(fetched.outputCurrency).toBe(FiatToken.BRL);

      // registerRamp SELL contract: the user-wallet squid transactions come
      // back for the caller's wallet, classified as broadcastable EVM txs.
      expect(rampProcess.type).toBe(RampDirection.SELL);
      expect(rampProcess.currentPhase).toBe("initial");
      expect(unsignedTransactions).toHaveLength(2);
      const phases = unsignedTransactions.map(tx => tx.phase).sort();
      expect(phases).toEqual(["squidRouterApprove", "squidRouterSwap"] as RampPhase[]);
      for (const tx of unsignedTransactions) {
        expect(tx.network).toBe(Networks.Polygon);
        expect(tx.signer.toLowerCase()).toBe(wallet.address.toLowerCase());
        expect(sdk.getUserTransactionType(tx)).toBe("evm-transaction");
        const broadcastable = sdk.getTransactionToBroadcast(tx);
        expect(broadcastable.to).toBeTruthy();
        expect(broadcastable.data).toBeTruthy();
      }

      // The SDK already signed and stored the ephemeral's Base-side txs.
      const stored = await RampState.findByPk(rampProcess.id);
      expect(stored?.userId).toBe(userId);
      const presignedPhases = (stored?.presignedTxs ?? []).map(tx => tx.phase);
      for (const phase of ["nablaApprove", "nablaSwap", "brlaPayoutOnBase"] as RampPhase[]) {
        expect(presignedPhases).toContain(phase);
      }
      // User-wallet phases must never be presigned (the API rejects them).
      expect(presignedPhases).not.toContain("squidRouterApprove");
      expect(presignedPhases).not.toContain("squidRouterSwap");

      // submitUserTransactions broadcasts through the caller's wallet handler
      // and reports each hash to the API.
      const afterSubmit = await sdk.submitUserTransactions(rampProcess.id, unsignedTransactions, {
        sendTransaction: sendFromWallet(wallet.address)
      });
      expect(afterSubmit.id).toBe(rampProcess.id);

      const withHashes = await RampState.findByPk(rampProcess.id);
      expect(withHashes?.state.squidRouterApproveHash).toBeTruthy();
      expect(withHashes?.state.squidRouterSwapHash).toBeTruthy();

      const { swapOutputRaw } = await scriptHappyWorld(rampProcess.id, quote.id);
      const started = await sdk.startRamp(rampProcess.id);
      expect(started.id).toBe(rampProcess.id);

      const status = await waitForComplete(sdk, rampProcess.id);
      expect(status.type).toBe(RampDirection.SELL);
      expect(Number(status.inputAmount)).toBe(Number(quote.inputAmount));
      expect(Number(status.outputAmount)).toBe(Number(quote.outputAmount));

      // End to end, the Avenia subaccount received the swap output and a pix
      // payout ticket was created.
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(swapOutputRaw);
      expect(world.brla.pixOutputTickets.length).toBe(1);
    },
    30000
  );

  it(
    "updateRamp (typed SELL update) records user-reported squid hashes against the ramp",
    async () => {
      const { sdk } = await createUserSdk();
      const { quote, rampProcess, unsignedTransactions, wallet } = await registerOfframp(sdk);

      // The integrator broadcasts outside the SDK and reports the hashes
      // through the typed updateRamp call instead of submitUserTxHash.
      const byPhase = Object.fromEntries(unsignedTransactions.map(tx => [tx.phase, tx]));
      const broadcast = sendFromWallet(wallet.address);
      const approveHash = await broadcast(byPhase.squidRouterApprove.txData as { to: string; data?: string; value?: string }, {
        unsignedTransaction: byPhase.squidRouterApprove
      });
      const swapHash = await broadcast(byPhase.squidRouterSwap.txData as { to: string; data?: string; value?: string }, {
        unsignedTransaction: byPhase.squidRouterSwap
      });

      const updated = await sdk.updateRamp(quote, rampProcess.id, {
        squidRouterApproveHash: approveHash,
        squidRouterSwapHash: swapHash
      });
      expect(updated.id).toBe(rampProcess.id);

      const state = await RampState.findByPk(rampProcess.id);
      expect(state?.state.squidRouterApproveHash).toBe(approveHash);
      expect(state?.state.squidRouterSwapHash).toBe(swapHash);
    },
    30000
  );

  it(
    "listAlfredpayFiatAccounts returns the caller's registered fiat accounts",
    async () => {
      const user = await createTestUser();
      const { plaintextKey } = await createTestApiKey({ userId: user.id });
      const customer = await createTestAlfredpayCustomer(user.id, { country: AlfredPayCountry.MX });
      world.alfredpay.fiatAccountsByCustomer.set(customer.providerCustomerId as string, [
        {
          accountNumber: "646180157000000004",
          accountType: "checking",
          customerId: customer.providerCustomerId as string,
          fiatAccountId: "fiat-account-1",
          type: AlfredpayFiatAccountType.SPEI
        }
      ]);

      const sdk = new VortexSdk({ apiBaseUrl: app.baseUrl, secretKey: plaintextKey, storeEphemeralKeys: false });
      const accounts = await sdk.listAlfredpayFiatAccounts(AlfredPayCountry.MX);
      expect(accounts).toHaveLength(1);
      expect(accounts[0].fiatAccountId).toBe("fiat-account-1");
      expect(accounts[0].type).toBe(AlfredpayFiatAccountType.SPEI);
    },
    30000
  );
});
