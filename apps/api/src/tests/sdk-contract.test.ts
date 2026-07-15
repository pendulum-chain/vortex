import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  type GetRampStatusResponse,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { VortexSdk, VortexSdkError } from "../../../../packages/sdk/src";
import RampState from "../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestTaxId, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { startTestApp, type TestApp } from "../test-utils/test-app";

function requireBrlaOnBase() {
  const details = evmTokenConfig[Networks.Base][EvmToken.BRLA];
  if (!details) {
    throw new Error("BRLA token config missing for Base");
  }
  return details;
}
const brlaTokenDetails = requireBrlaOnBase();
const BRLA_ON_BASE = brlaTokenDetails.erc20AddressSourceChain as `0x${string}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

/**
 * The SDK signs EVM transactions through a real viem wallet client, and viem's
 * signTransaction issues a single eth_chainId RPC before signing locally with
 * the ephemeral key. Answer that one call in-memory (the corridor only signs on
 * Base) and let every other request fall through to the fetch guard, so any
 * genuine network use still fails loudly. The SDK's NetworkManager itself is
 * inert here: it only opens chain WebSockets when signing Pendulum, Moonbeam,
 * or Hydration transactions, and the direct BRL→BRLA-on-Base corridor produces
 * a single Base EVM transaction.
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
 * SDK ↔ API contract tests: the real @vortexfi/sdk (imported from source)
 * drives the real in-process API over HTTP on the BRL onramp corridor
 * (pix → BRLA on Base; EUR is kill-switched at registerRamp). A response-shape
 * change that would break SDK integrators fails here.
 */
describe("SDK ↔ API contract (BRL onramp, pix → BRLA on Base)", () => {
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
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 0, USDC: 0, USDM: 0, USDT: 0 };
  });

  /** A KYC'd user with a user-linked secret key, and an SDK authenticated as them. */
  async function createUserSdk(subAccountId?: string): Promise<{ sdk: VortexSdk; userId: string }> {
    const user = await createTestUser();
    // provider_customers enforces UNIQUE(provider, provider_subaccount_id); secondary users
    // in a test must bring their own (unused) subaccount id.
    await createTestTaxId(user.id, subAccountId ? { subAccountId } : {});
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    // storeEphemeralKeys: false keeps the SDK from writing ephemerals_<rampId>.json to disk.
    const sdk = new VortexSdk({ apiBaseUrl: app.baseUrl, secretKey: plaintextKey, storeEphemeralKeys: false });
    return { sdk, userId: user.id };
  }

  function quoteRequest() {
    return {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.BRLA,
      rampType: RampDirection.BUY,
      to: Networks.Base
    } as const;
  }

  /**
   * Scripts the fake world so every polling loop in the corridor succeeds on
   * its first check (same script as the corridor scenario tests): minted BRL is
   * already on the Avenia subaccount, the ephemeral has Base gas, the
   * Avenia→Base transfer credits BRLA instantly, and submitted raw ERC-20
   * transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(ephemeralAddress: string): void {
    world.brla.accountBalances.BRLA = 1_000_000;
    world.evm.setNativeBalance(Networks.Base, ephemeralAddress, parseUnits("0.001", 18));
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) {
        world.evm.setErc20Balance(Networks.Base, BRLA_ON_BASE, walletAddress, parseUnits("1000000", 18));
      }
    };
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

  /** Polls getRampStatus (itself part of the contract) until the ramp completes. */
  async function waitForComplete(sdk: VortexSdk, rampId: string): Promise<GetRampStatusResponse> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const status = await sdk.getRampStatus(rampId);
      // Fail immediately (not via the poll timeout) if the status shape breaks.
      expect(status.currentPhase).toBeDefined();
      if (status.currentPhase === "complete") {
        return status;
      }
      // getRampStatus intentionally never reports "failed"; read the DB so a
      // failed ramp aborts with its error logs instead of timing out.
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
    "drives the full onramp lifecycle: createQuote → registerRamp → startRamp → getRampStatus",
    async () => {
      const { sdk, userId } = await createUserSdk();
      const destination = privateKeyToAccount(generatePrivateKey()).address;

      const quote = await sdk.createQuote(quoteRequest());

      // Quote contract: the fields the SDK's QuoteResponse type promises to integrators.
      expect(quote.id).toMatch(UUID_PATTERN);
      expect(quote.rampType).toBe(RampDirection.BUY);
      expect(quote.from).toBe(EPaymentMethod.PIX);
      expect(quote.to).toBe(Networks.Base);
      expect(quote.network).toBe(Networks.Base);
      // The API normalizes fiat amounts to two decimals ("100" -> "100.00").
      expect(Number(quote.inputAmount)).toBe(100);
      expect(quote.inputCurrency).toBe(FiatToken.BRL);
      expect(quote.outputCurrency).toBe(EvmToken.BRLA);
      expect(Number(quote.outputAmount)).toBeGreaterThan(0);
      expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
      const feeFields = [
        quote.networkFeeFiat,
        quote.anchorFeeFiat,
        quote.vortexFeeFiat,
        quote.partnerFeeFiat,
        quote.totalFeeFiat,
        quote.processingFeeFiat,
        quote.networkFeeUsd,
        quote.anchorFeeUsd,
        quote.vortexFeeUsd,
        quote.partnerFeeUsd,
        quote.totalFeeUsd,
        quote.processingFeeUsd
      ];
      for (const fee of feeFields) {
        expect(Number.isFinite(Number(fee))).toBe(true);
      }
      expect(quote.feeCurrency).toBeTruthy();

      // registerRamp runs the SDK's full internal flow: BRL limit pre-flight,
      // ephemeral generation (Substrate + EVM), /v1/ramp/register, signing the
      // returned unsignedTxs, and /v1/ramp/update with the presigned txs.
      const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, { destinationAddress: destination });

      // Onramps carry no user-wallet transactions.
      expect(unsignedTransactions).toEqual([]);
      expect(rampProcess.id).toMatch(UUID_PATTERN);
      expect(rampProcess.quoteId).toBe(quote.id);
      expect(rampProcess.type).toBe(RampDirection.BUY);
      expect(rampProcess.currentPhase).toBe("initial");
      // Amount decimal padding differs between endpoints; the numeric value is the contract.
      expect(Number(rampProcess.inputAmount)).toBe(Number(quote.inputAmount));
      expect(Number(rampProcess.outputAmount)).toBe(Number(quote.outputAmount));
      const unsigned = rampProcess.unsignedTxs ?? [];
      expect(unsigned).toHaveLength(1);
      expect(unsigned[0].phase).toBe("destinationTransfer");
      expect(unsigned[0].network).toBe(Networks.Base);
      const ephemeralAddress = unsigned[0].signer;

      // The SDK-signed transfer stored by /v1/ramp/update must pay the
      // registered destination exactly the quoted BRLA on Base — the core
      // signing contract between SDK and backend.
      const stored = await RampState.findByPk(rampProcess.id);
      expect(stored?.userId).toBe(userId);
      const presigned = stored?.presignedTxs ?? [];
      expect(presigned).toHaveLength(1);
      expect(presigned[0].phase).toBe("destinationTransfer");
      expect(presigned[0].signer).toBe(ephemeralAddress);
      const parsed = parseTransaction(presigned[0].txData as `0x${string}`);
      expect(parsed.chainId).toBe(8453);
      expect(parsed.to?.toLowerCase()).toBe(BRLA_ON_BASE.toLowerCase());
      if (!parsed.data) {
        throw new Error("Presigned destinationTransfer has no calldata");
      }
      const decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data });
      expect(decoded.functionName).toBe("transfer");
      const amountRaw = parseUnits(quote.outputAmount, brlaTokenDetails.decimals);
      expect(decoded.args).toEqual([destination, amountRaw]);

      // startRamp re-validates the SDK's presigned txs server-side (including
      // backup-transaction requirements) and kicks off processing.
      scriptHappyWorld(ephemeralAddress);
      const started = await sdk.startRamp(rampProcess.id);
      expect(started.id).toBe(rampProcess.id);
      expect(started.quoteId).toBe(quote.id);

      const status = await waitForComplete(sdk, rampProcess.id);
      expect(status.id).toBe(rampProcess.id);
      expect(status.quoteId).toBe(quote.id);
      expect(status.type).toBe(RampDirection.BUY);
      expect(status.from).toBe(EPaymentMethod.PIX);
      expect(status.to).toBe(Networks.Base);
      expect(Number(status.inputAmount)).toBe(Number(quote.inputAmount));
      expect(Number(status.outputAmount)).toBe(Number(quote.outputAmount));
      expect(status.transactionHash).toBeTruthy();

      // End to end, the destination received the quoted amount in the fake ledger.
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, destination)).toBe(amountRaw);
    },
    30000
  );

  it(
    "registerRamp without a secretKey fails fast in the SDK, before any registration call",
    async () => {
      const anonymous = new VortexSdk({ apiBaseUrl: app.baseUrl, storeEphemeralKeys: false });
      // Quotes stay anonymous-eligible (rate discovery); only registration requires the key.
      const quote = await anonymous.createQuote(quoteRequest());
      const destination = privateKeyToAccount(generatePrivateKey()).address;

      await expect(anonymous.registerRamp(quote, { destinationAddress: destination })).rejects.toThrow(
        /requires a user-linked secretKey/
      );
    },
    30000
  );

  it(
    "a foreign user's ramp surfaces as a typed VortexSdkError with status 403",
    async () => {
      const owner = await createUserSdk();
      const stranger = await createUserSdk("test-subaccount-id-stranger");
      const destination = privateKeyToAccount(generatePrivateKey()).address;

      const quote = await owner.sdk.createQuote(quoteRequest());
      const { rampProcess } = await owner.sdk.registerRamp(quote, { destinationAddress: destination });

      const statusError = await stranger.sdk.getRampStatus(rampProcess.id).then(
        () => null,
        error => error
      );
      expect(statusError).toBeInstanceOf(VortexSdkError);
      expect((statusError as VortexSdkError).status).toBe(403);

      const startError = await stranger.sdk.startRamp(rampProcess.id).then(
        () => null,
        error => error
      );
      expect(startError).toBeInstanceOf(VortexSdkError);
      expect((startError as VortexSdkError).status).toBe(403);

      // The owner is unaffected.
      const status = await owner.sdk.getRampStatus(rampProcess.id);
      expect(status.id).toBe(rampProcess.id);
    },
    30000
  );
});
