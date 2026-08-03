import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ALFREDPAY_ERC20_DECIMALS,
  ALFREDPAY_ERC20_TOKEN,
  AlfredPayCountry,
  AlfredpayOnrampStatus,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  type GetRampStatusResponse,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, parseTransaction, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { VortexSdk } from "../../../../packages/sdk/src";
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
  /** KYC country the registration guard requires a completed profile for. */
  country: AlfredPayCountry;
  /** Quote source string (payment rail). */
  rail: EPaymentMethod;
  /** Fiat amount for the BUY quote (within the per-currency limits). */
  inputAmount: string;
  /** USDT the fake anchor mints per unit of fiat. */
  onrampRate: number;
  /** Rail-specific payment instructions registerRamp must surface as achPaymentData. */
  expectedInstructions: Record<string, string>;
}

// Rails per currency: MXN funds over spei, USD and COP over ach, ARS over cbu.
// The MXN rate is the same legible flat rate the MXN corridor scenario uses
// (2000 MXN * 0.05 = 100 USDT); the others mirror the FakePrices feeds. The
// expected instructions match FakeAlfredpay's rail-realistic per-currency
// defaults (fiatPaymentInstructionsByCurrency).
const FULL_LIFECYCLE_CASES: CurrencyCase[] = [
  {
    alfredpayCurrency: "MXN",
    country: AlfredPayCountry.MX,
    expectedInstructions: { clabe: "646180157000000004", paymentType: "SPEI" },
    fiat: FiatToken.MXN,
    inputAmount: "2000",
    onrampRate: 0.05,
    rail: EPaymentMethod.SPEI
  },
  {
    alfredpayCurrency: "USD",
    country: AlfredPayCountry.US,
    expectedInstructions: {
      bankAccountNumber: "000123456789",
      bankName: "Test Bank USA",
      bankRoutingNumber: "021000021",
      paymentType: "ACH"
    },
    fiat: FiatToken.USD,
    inputAmount: "20000",
    onrampRate: 1,
    rail: EPaymentMethod.ACH
  },
  {
    alfredpayCurrency: "COP",
    country: AlfredPayCountry.CO,
    expectedInstructions: {
      bankAccountNumber: "01234567890",
      bankName: "Bancolombia de Prueba",
      bankRoutingNumber: "007",
      paymentType: "ACH"
    },
    fiat: FiatToken.COP,
    inputAmount: "50000",
    onrampRate: 1 / 4000,
    rail: EPaymentMethod.ACH
  },
  {
    alfredpayCurrency: "ARS",
    country: AlfredPayCountry.AR,
    expectedInstructions: {
      accountHolderName: "Vortex Test Account",
      bankAccountNumber: "2850590940090418135201",
      paymentType: "CBU"
    },
    fiat: FiatToken.ARS,
    inputAmount: "10000",
    onrampRate: 1 / 1000,
    rail: EPaymentMethod.CBU
  }
];

/**
 * Same shim as the other SDK contract tests: the SDK's viem wallet client
 * issues one eth_chainId RPC before signing locally with the ephemeral key.
 * The Alfredpay BUY corridors only ephemeral-sign on Polygon (the anchor mints
 * USDT there), so answer with the Polygon chain id.
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
 * SDK ↔ API contract tests for the Alfredpay BUY rail (fiat → USDT on
 * Polygon): the real @vortexfi/sdk drives the real in-process API. The full
 * lifecycle runs once per currency (MXN/spei, USD/ach, COP/ach, ARS/cbu) with
 * registerRamp's internal flow (ephemeral generation, /v1/ramp/register,
 * signing the destinationTransfer + backups, and the /v1/ramp/update that
 * creates the anchor order and returns the fiat payment details), then
 * startRamp and getRampStatus polling to completion.
 */
describe("SDK ↔ API contract (Alfredpay onramps, fiat → USDT on Polygon)", () => {
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
    world.alfredpay.onrampRate = 1;
    world.alfredpay.onCreateOnramp = undefined;
    world.alfredpay.onrampStatus = AlfredpayOnrampStatus.TRADE_COMPLETED;
    world.alfredpay.onrampStatusMetadata = null;
  });

  /** A user with a completed Alfredpay KYC profile and an SDK authenticated via their secret key. */
  async function createUserSdk(country: AlfredPayCountry): Promise<{ sdk: VortexSdk; userId: string }> {
    const user = await createTestUser();
    await createTestAlfredpayCustomer(user.id, { country });
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const sdk = new VortexSdk({ apiBaseUrl: app.baseUrl, secretKey: plaintextKey, storeEphemeralKeys: false });
    return { sdk, userId: user.id };
  }

  function quoteRequest(fiat: FiatToken, rail: EPaymentMethod, inputAmount: string) {
    return {
      from: rail,
      inputAmount,
      inputCurrency: fiat,
      network: Networks.Polygon,
      outputCurrency: EvmToken.USDT,
      rampType: RampDirection.BUY,
      to: Networks.Polygon
    } as const;
  }

  /**
   * Scripts the fake world so every polling loop succeeds on its first check
   * (same script as the corridor scenario tests): the Alfredpay mint has
   * already credited the ephemeral's USDT, the ephemeral has Polygon gas, and
   * submitted raw ERC-20 transfers are applied to the in-memory ledger.
   */
  function scriptHappyWorld(ephemeralAddress: string, mintAmountRaw: bigint): void {
    world.evm.setNativeBalance(Networks.Polygon, ephemeralAddress, parseUnits("2", 18));
    world.evm.setErc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, ephemeralAddress, mintAmountRaw);
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

  for (const currency of FULL_LIFECYCLE_CASES) {
    it(
      `drives the full ${currency.fiat}/${currency.rail} lifecycle: createQuote → registerRamp → startRamp → getRampStatus`,
      async () => {
        world.alfredpay.onrampRate = currency.onrampRate;
        const { sdk, userId } = await createUserSdk(currency.country);
        const destination = privateKeyToAccount(generatePrivateKey()).address;
        const ordersBefore = world.alfredpay.onrampOrders.length;

        const quote = await sdk.createQuote(quoteRequest(currency.fiat, currency.rail, currency.inputAmount));

        // Quote contract: the fields the SDK's QuoteResponse type promises to integrators.
        expect(quote.id).toMatch(UUID_PATTERN);
        expect(quote.rampType).toBe(RampDirection.BUY);
        expect(quote.from).toBe(currency.rail);
        expect(quote.to).toBe(Networks.Polygon);
        expect(quote.network).toBe(Networks.Polygon);
        expect(Number(quote.inputAmount)).toBe(Number(currency.inputAmount));
        expect(quote.inputCurrency).toBe(currency.fiat);
        expect(quote.outputCurrency).toBe(EvmToken.USDT);
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

        // registerRamp runs the SDK's full internal Alfredpay BUY flow: ephemeral
        // generation (Substrate + EVM), /v1/ramp/register, signing the returned
        // destinationTransfer (plus its backups), and the /v1/ramp/update that
        // creates the anchor order — there is no separate user sign/update step.
        const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, { destinationAddress: destination });

        // Alfredpay onramps settle fiat off-chain: no user-wallet transactions.
        expect(unsignedTransactions).toEqual([]);
        expect(rampProcess.id).toMatch(UUID_PATTERN);
        expect(rampProcess.quoteId).toBe(quote.id);
        expect(rampProcess.type).toBe(RampDirection.BUY);
        expect(rampProcess.currentPhase).toBe("initial");
        expect(Number(rampProcess.inputAmount)).toBe(Number(quote.inputAmount));
        expect(Number(rampProcess.outputAmount)).toBe(Number(quote.outputAmount));

        // The client-visible payment details: registerRamp surfaces the
        // anchor's rail-specific fiatPaymentInstructions verbatim as
        // achPaymentData (SPEI/CLABE for MXN, ACH bank fields for USD/COP,
        // CBU for ARS).
        expect(rampProcess.achPaymentData).toMatchObject(currency.expectedInstructions);
        expect(rampProcess.achPaymentData?.reference).toBeTruthy();

        // The ephemeral surface of the direct Alfredpay BUY route: the
        // destination transfer plus the Polygon dust cleanup.
        const unsigned = rampProcess.unsignedTxs ?? [];
        expect(unsigned.map(tx => tx.phase).sort()).toEqual(["destinationTransfer", "polygonCleanup"]);
        expect(unsigned.every(tx => tx.network === Networks.Polygon)).toBe(true);
        const destinationTransferTx = unsigned.find(tx => tx.phase === "destinationTransfer");
        if (!destinationTransferTx) {
          throw new Error("No destinationTransfer in unsignedTxs");
        }
        const ephemeralAddress = destinationTransferTx.signer;

        // The SDK-signed transfer stored by /v1/ramp/update must pay the
        // registered destination exactly the quoted USDT on Polygon — the core
        // signing contract between SDK and backend.
        const stored = await RampState.findByPk(rampProcess.id);
        expect(stored?.userId).toBe(userId);
        expect(stored?.state.alfredpayTransactionId).toBeTruthy();
        const presigned = stored?.presignedTxs ?? [];
        expect(presigned.map(tx => tx.phase).sort()).toEqual(["destinationTransfer", "polygonCleanup"]);
        const presignedTransfer = presigned.find(tx => tx.phase === "destinationTransfer");
        if (!presignedTransfer) {
          throw new Error("No presigned destinationTransfer");
        }
        expect(presignedTransfer.signer).toBe(ephemeralAddress);
        const parsed = parseTransaction(presignedTransfer.txData as `0x${string}`);
        expect(parsed.chainId).toBe(137);
        expect(parsed.to?.toLowerCase()).toBe(ALFREDPAY_ERC20_TOKEN.toLowerCase());
        if (!parsed.data) {
          throw new Error("Presigned destinationTransfer has no calldata");
        }
        const decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data });
        expect(decoded.functionName).toBe("transfer");
        const amountRaw = parseUnits(quote.outputAmount, ALFREDPAY_ERC20_DECIMALS);
        expect(decoded.args).toEqual([destination, amountRaw]);

        // Registration created exactly one anchor order: this currency's
        // Alfredpay code in, USDT minted to the ephemeral.
        expect(world.alfredpay.onrampOrders).toHaveLength(ordersBefore + 1);
        const order = world.alfredpay.onrampOrders[world.alfredpay.onrampOrders.length - 1];
        expect(order.fromCurrency).toBe(currency.alfredpayCurrency as never);
        expect(order.toCurrency).toBe("USDT" as never);
        expect(Number(order.amount)).toBe(Number(currency.inputAmount));
        expect(order.depositAddress.toLowerCase()).toBe(ephemeralAddress.toLowerCase());

        const persistedQuote = await QuoteTicket.findByPk(quote.id);
        const metadata = persistedQuote?.metadata as unknown as
          | { blocks: { alfredpayMint?: { outputAmountRaw?: string } } }
          | undefined;
        const mintAmountRaw = BigInt(metadata?.blocks.alfredpayMint?.outputAmountRaw ?? "0");
        expect(mintAmountRaw).toBeGreaterThan(0n);

        scriptHappyWorld(ephemeralAddress, mintAmountRaw);
        const started = await sdk.startRamp(rampProcess.id);
        expect(started.id).toBe(rampProcess.id);
        expect(started.quoteId).toBe(quote.id);

        const status = await waitForComplete(sdk, rampProcess.id);
        expect(status.id).toBe(rampProcess.id);
        expect(status.quoteId).toBe(quote.id);
        expect(status.type).toBe(RampDirection.BUY);
        expect(status.from).toBe(currency.rail);
        expect(status.to).toBe(Networks.Polygon);
        expect(Number(status.inputAmount)).toBe(Number(quote.inputAmount));
        expect(Number(status.outputAmount)).toBe(Number(quote.outputAmount));

        // End to end, the destination received the quoted amount in the fake ledger.
        expect(world.evm.erc20Balance(Networks.Polygon, ALFREDPAY_ERC20_TOKEN, destination)).toBe(amountRaw);
      },
      30000
    );
  }
});
