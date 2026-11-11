import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  EvmToken,
  evmTokenConfig,
  Networks,
  RampDirection,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  robinhoodChain,
  type SignedTypedData,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import {
  type Abi,
  ContractFunctionExecutionError,
  ContractFunctionZeroDataError,
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseEther,
  parseTransaction,
  parseUnits,
  toHex
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createApi,
  createBrazilKyc,
  createJsonStorage,
  createVortexSession
  // @ts-expect-error The wallet kit is plain JavaScript without declarations.
} from "../../../../../packages/consumer-kit/src/index.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { localHistoryRows, mergeHistory, serverHistoryRows } from "../../../../stocks/src/lib/history.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { stepFor, stepsFor } from "../../../../stocks/src/lib/phases.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { createRobinhoodClient, readPortfolio, tokenFlags } from "../../../../stocks/src/lib/portfolio.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { quoteNeedsRefresh } from "../../../../stocks/src/lib/purchase-options.js";
import {
  freshPauseReason,
  isComingSoon,
  rampOpenState,
  UNAVAILABLE_COPY_PT,
  withIssuerPauses
  // @ts-expect-error The Stocks app is plain JavaScript without declarations.
} from "../../../../stocks/src/lib/ramp-contract.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { createRampStores } from "../../../../stocks/src/lib/stores.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { maxSellAmount } from "../../../../stocks/src/lib/token.js";
// @ts-expect-error The Stocks app is plain JavaScript without declarations.
import { createVortexStocksAdapter } from "../../../../stocks/src/lib/vortex-stocks.js";
import { getEvmFundingAccount } from "../../api/services/phases/blocks/core/evm-funding";
import { getBlockMetadata, getBlockState } from "../../api/services/phases/blocks/core/metadata";
import { ROBINHOOD_STOCKS } from "../../api/services/phases/blocks/core/robinhood-stocks";
import { AveniaMintContext } from "../../api/services/phases/blocks/phases/avenia-mint/simulation";
import { AveniaOfframpPayoutContext } from "../../api/services/phases/blocks/phases/avenia-offramp-payout/simulation";
import { NablaSwapContext } from "../../api/services/phases/blocks/phases/nabla-swap/simulation";
import { StockRouteContext, type StockRouteState } from "../../api/services/phases/blocks/phases/stock-route/simulation";
import phaseProcessor from "../../api/services/phases/phase-processor";
import UnhandledPaymentWorker from "../../api/workers/unhandled-payment.worker";
import sequelize from "../../config/database";
import { config } from "../../config/vars";
import { up as seedStocksPartner } from "../../database/migrations/089-add-stocks-partner";
import KycCase from "../../models/kycCase.model";
import MaintenanceSchedule from "../../models/maintenanceSchedule.model";
import { VerificationStatus } from "../../models/providerCustomer.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestTaxId, updatePartnerPricing } from "../../test-utils/factories";
import { type FakeWorld, installFakeChainIdRpc, installFakeWorld } from "../../test-utils/fake-world";
import { installFakeSupabaseAuth, TEST_OTP_CODE } from "../../test-utils/fake-world/fake-auth";
import { scriptRobinhoodChain, TokenLedger } from "../../test-utils/fake-world/robinhood-chain";
import { startTestApp, type TestApp } from "../../test-utils/test-app";

const NVDA_USD = 181n;
const NVDA = ROBINHOOD_STOCKS.NVDA.address;
const USDC_ON_BASE = RELAY_BASE_USDC_ADDRESS;
const USDG_ON_ROBINHOOD = RELAY_ROBINHOOD_USDG_ADDRESS;
const BRLA_ON_BASE = evmTokenConfig[Networks.Base][EvmToken.BRLA]?.erc20AddressSourceChain as `0x${string}`;
const FUNDING = getEvmFundingAccount(Networks.Robinhood).address;
const FEE_PAYOUT = "0x000000000000000000000000000000000000fee5";
const ATTACKER = "0x00000000000000000000000000000000000bad00";
// What the fake Avenia reports as the owner of any Pix key, so the seller's own CPF here.
const TAX_ID = "12345678900";
const OTHER_TAX_ID = "12345678901";
const PIX_KEY = "test-pix-key";
const SOLD = "0.5";
const SOLD_RAW = parseUnits(SOLD, 18);
const BOUGHT_BRL = 500;
const SIGN = "eth_signTypedData_v4";
const NEVER = new Promise<Response>(() => undefined);
const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);
const CHAIN_READS = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
  "function paused() view returns (bool)",
  "function oraclePaused() view returns (bool)",
  "function getEthBalance(address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) view returns (Result[])"
]);

/** Stands between the app and the API: gets the path and sends the request when it calls `respond`. */
type Intercept = (path: string, respond: () => Promise<Response>) => Promise<Response>;

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    key: index => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: key => void items.delete(key),
    setItem: (key, value) => void items.set(key, value)
  };
}

/** What createEphemeralStore needs of IndexedDB, which bun lacks. The store's own encryption stays real. */
function memoryIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>();
  const database = {
    close: () => undefined,
    createObjectStore: (name: string) => stores.set(name, new Map()),
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    transaction(name: string) {
      const store = stores.get(name) as Map<string, unknown>;
      const transaction: { objectStore: () => unknown; oncomplete?: () => void } = {
        objectStore: () => ({
          delete: (key: string) => ({ result: store.delete(key) }),
          get: (key: string) => ({ result: store.get(key) }),
          put: (value: unknown, key: string) => ({ result: store.set(key, value) && key })
        })
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    }
  };
  return {
    open() {
      const request: { onsuccess?: () => void; onupgradeneeded?: () => void; result: typeof database } = { result: database };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    stores
  };
}

/** Web Locks, which bun lacks. A page's locks die with it, and the queue the kit keeps for non-browsers would hold them forever. */
function memoryWebLocks() {
  let queues = new Map<string, Promise<unknown>>();
  return {
    releaseAll() {
      queues = new Map();
    },
    request(name: string, run: () => Promise<unknown>) {
      const pending = (queues.get(name) ?? Promise.resolve()).catch(() => undefined).then(run);
      queues.set(name, pending);
      return pending;
    }
  };
}

/** The embedded wallet: EIP-1193 over a viem local account that really signs. It answers nothing else, so a new kind of request fails here. */
function createWallet() {
  const account = privateKeyToAccount(generatePrivateKey());
  const controls = { leavePromptOpen: false, rejectNext: false };
  const requests: string[] = [];
  let chainId = 1;
  const provider = {
    async request({ method, params }: { method: string; params: unknown[] }) {
      requests.push(method);
      if (method === "wallet_switchEthereumChain") {
        chainId = Number((params[0] as { chainId: string }).chainId);
        return null;
      }
      if (method !== SIGN) throw new Error(`The wallet does not implement ${method}.`);
      const [from, payload] = params as [`0x${string}`, string];
      const typedData = JSON.parse(payload);
      if (!isAddressEqual(from, account.address)) throw new Error("The wallet does not hold this account.");
      if (Number(typedData.domain.chainId) !== chainId) throw new Error("The wallet is on another chain.");
      if (!typedData.types.EIP712Domain) throw new Error("eth_signTypedData_v4 hashes the domain by its declared type.");
      if (controls.leavePromptOpen) {
        controls.leavePromptOpen = false;
        return NEVER;
      }
      if (controls.rejectNext) {
        controls.rejectNext = false;
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      return account.signTypedData(typedData);
    }
  };
  return { address: account.address, controls, requests, seam: { chain: robinhoodChain, provider } };
}

const until = async (condition: () => boolean, label: string) => {
  for (const deadline = Date.now() + 10_000; !condition(); await new Promise(resolve => setTimeout(resolve, 5))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
  }
};

/** Answers with `rewrite` of the API's body on the paths it matches. */
const rewriting =
  <Body>(matches: (path: string) => boolean, rewrite: (body: Body) => unknown): Intercept =>
  async (path, respond) => {
    const response = await respond();
    return matches(path) ? Response.json(rewrite((await response.json()) as Body)) : response;
  };

/** Lets the request reach the API, and the page never hears back. */
const answerLost = (matches: (path: string) => boolean, onDelivered: () => void): Intercept => {
  return async (path, respond) => {
    if (!matches(path)) return respond();
    await respond();
    onDelivered();
    return NEVER;
  };
};

/**
 * The Stocks app's real adapter, wallet kit and SDK (the built one, so `bun build:sdk` first) against the real API, called
 * as the flows call them. Only the world and the wallet are fake: the world answers the API's boundaries and Robinhood
 * Chain's public RPC, and its TokenLedger takes a permit only with the owner's signature over the current nonce.
 */
describe("the Stocks app against the real API", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let restoreChainIdRpc: () => void;
  let app: TestApp;
  let fetchBeforeThisFile: typeof fetch;
  let intercept: Intercept | undefined;
  let chainReads: string[];
  let rpcDown = false;
  let emailCount = 0;
  const enabledDirections = config.stocks.enabledDirections;
  const browser = globalThis as unknown as { indexedDB?: unknown; isSecureContext?: boolean };
  const browserBefore = { indexedDB: browser.indexedDB, isSecureContext: browser.isSecureContext };
  const indexedDb = memoryIndexedDb();
  const webLocks = memoryWebLocks();

  async function readChain(to: `0x${string}`, data: `0x${string}`): Promise<`0x${string}`> {
    const { args, functionName } = decodeFunctionData({ abi: CHAIN_READS, data });
    chainReads.push(functionName);
    if (functionName === "aggregate3") {
      const result = await Promise.all(
        (args[0] as readonly { callData: `0x${string}`; target: `0x${string}` }[]).map(({ callData, target }) =>
          readChain(target, callData).then(
            returnData => ({ returnData, success: true }),
            () => ({ returnData: "0x" as const, success: false })
          )
        )
      );
      return encodeFunctionResult({ abi: CHAIN_READS, functionName, result });
    }
    const client = world.evm.getClient(Networks.Robinhood) as { readContract: (params: unknown) => Promise<unknown> };
    const result =
      functionName === "getEthBalance"
        ? world.evm.nativeBalance(Networks.Robinhood, args[0] as string)
        : await client.readContract({ abi: CHAIN_READS, address: to, args, functionName });
    return encodeFunctionResult({ abi: CHAIN_READS, functionName, result } as Parameters<typeof encodeFunctionResult>[0]);
  }

  /** What leaves the browser: Robinhood Chain's public RPC is the world's, and a test can stand between the app and the API. */
  function installBrowserNetwork(): void {
    const inner = globalThis.fetch;
    fetchBeforeThisFile = inner;
    const rpcHost = new URL(robinhoodChain.rpcUrls.default.http[0]).host;
    const fake = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (intercept && url.startsWith(app.baseUrl)) return intercept(url.slice(app.baseUrl.length), () => inner(input, init));
      if (new URL(url).host !== rpcHost || typeof init?.body !== "string") return inner(input, init);
      if (rpcDown) throw new TypeError("fetch failed");
      const { id, method, params } = JSON.parse(init.body);
      if (method === "eth_chainId") return Response.json({ id, jsonrpc: "2.0", result: toHex(robinhoodChain.id) });
      if (method !== "eth_call") return inner(input, init);
      return Response.json({ id, jsonrpc: "2.0", result: await readChain(params[0].to, params[0].data) });
    }) as typeof fetch;
    globalThis.fetch = Object.assign(fake, inner);
  }

  /** A device's browser storage. Every load() is a page load: only the storage carries over. */
  function createDevice() {
    const localStorage = memoryStorage();
    let sessionStorage = memoryStorage();
    return {
      closeTab() {
        sessionStorage = memoryStorage();
      },
      load() {
        webLocks.releaseAll();
        const apiBase = app.baseUrl;
        const session = createVortexSession({ api: createApi({ apiBase }), storage: () => sessionStorage });
        const stores = createRampStores({ localStorage: createJsonStorage(() => localStorage), simulated: false });
        const adapter = createVortexStocksAdapter({
          activeRampStore: stores.activeRamp,
          apiBase,
          enabled: true,
          ephemeralStore: stores.ephemeral,
          kyc: createBrazilKyc({ session }),
          network: Networks.Robinhood,
          session
        });
        return { adapter, session, store: stores.activeRamp };
      }
    };
  }

  type Page = ReturnType<ReturnType<typeof createDevice>["load"]>;

  beforeAll(async () => {
    world = installFakeWorld();
    restoreChainIdRpc = installFakeChainIdRpc();
    auth = installFakeSupabaseAuth();
    installBrowserNetwork();
    browser.indexedDB = indexedDb;
    browser.isSecureContext = true;
    Object.defineProperty(navigator, "locks", { configurable: true, value: webLocks });
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    config.stocks.enabledDirections = enabledDirections;
    Object.assign(browser, browserBefore);
    Reflect.deleteProperty(navigator, "locks");
    await app?.close();
    globalThis.fetch = fetchBeforeThisFile;
    auth?.restore();
    restoreChainIdRpc?.();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await seedStocksPartner(sequelize.getQueryInterface());
    await updatePartnerPricing("vortex", RampDirection.BUY, { payoutAddressEvm: FEE_PAYOUT });
    await updatePartnerPricing("vortex", RampDirection.SELL, { payoutAddressEvm: FEE_PAYOUT });
    config.stocks.enabledDirections = [RampDirection.BUY, RampDirection.SELL];
    intercept = undefined;
    chainReads = [];
    rpcDown = false;
    world.evm.strictReceipts = true;
    world.evm.onTransaction = undefined;
    world.evm.revertedReceiptHashes.clear();
    world.evm.sentTransactions.length = 0;
    world.evm.setFeeEstimate(Networks.Base, 6_500_000n, 1_000_000n);
    world.evm.setFeeEstimate(Networks.Robinhood, 30_000_000n, 0n);
    world.evm.setNativeBalance(Networks.Base, FUNDING, parseEther("10"));
    world.evm.setNativeBalance(Networks.Robinhood, FUNDING, parseEther("10"));
    world.evm.setErc20Balance(Networks.Robinhood, NVDA, FUNDING, 0n);
    world.evm.setErc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, FUNDING, 0n);
    world.evm.setErc20Balance(Networks.Base, USDC_ON_BASE, FEE_PAYOUT, 0n);
    world.brla.onPixOutputTicket = undefined;
    world.brla.accountBalances = { BRLA: 1_000_000, USDC: 0, USDM: 0, USDT: 0 };
    world.brla.subaccountEvmWallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    world.relay.statusRequests.length = 0;
    world.relay.statusScript.length = 0;
    world.relay.onStatusPoll = undefined;
    world.relay.nextStatusFault = null;
    world.relay.nextQuoteFault = null;
    world.relay.feeBps = 6n;
    world.relay.finalStatus = { inTxHashes: [`0x${"aa".repeat(32)}`], status: "success", txHashes: [`0x${"bb".repeat(32)}`] };
    world.evm.onReadContract = (_network, params) => {
      if (params.functionName !== "quoteSwapExactTokensForTokens") return undefined;
      const amountIn = params.args?.[0] as bigint;
      return amountIn >= 10n ** 18n ? amountIn / 5n / 10n ** 12n : amountIn * 5n * 10n ** 12n;
    };
    scriptRobinhoodChain(world.evm, NVDA_USD);
  });

  /** The e-mail code step, through the real session and the API's real auth routes. */
  async function verifyEmail({ session }: Page, email = `user-${++emailCount}@example.com`): Promise<void> {
    await session.requestOtp(email);
    await session.verifyOtp(email, TEST_OTP_CODE, { privyDid: "did:privy:test" });
  }

  /** The user the fake Avenia approved, with their CPF. */
  async function signIn(page: Page, taxId = TAX_ID): Promise<void> {
    await verifyEmail(page);
    await createTestTaxId(page.session.get().user_id, { taxId });
  }

  async function buyer() {
    const wallet = createWallet();
    const device = createDevice();
    const page = device.load();
    await signIn(page);
    const quote = await page.adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
    return { device, page, quote, wallet };
  }

  async function seller(taxId = TAX_ID) {
    const wallet = createWallet();
    const device = createDevice();
    const page = device.load();
    await signIn(page, taxId);
    world.evm.setErc20Balance(Networks.Robinhood, NVDA, wallet.address, SOLD_RAW);
    const quote = await page.adapter.quoteSell({ symbol: "NVDA", tokenAmount: SOLD, walletAddress: wallet.address });
    const register = (onRegistered?: (ramp: { id: string }) => void) =>
      page.adapter.registerSell({ onRegistered, pixKey: PIX_KEY, quote, wallet: wallet.seam, walletAddress: wallet.address });
    /** The tab dies in front of the wallet prompt. */
    const registerUpToWalletPrompt = async () => {
      wallet.controls.leavePromptOpen = true;
      let rampId = "";
      void register(ramp => {
        rampId = ramp.id;
      });
      await until(() => wallet.requests.includes(SIGN), "the wallet prompt");
      return rampId;
    };
    return { device, page, quote, register, registerUpToWalletPrompt, wallet };
  }

  async function rampFacts(rampId: string) {
    const ramp = (await RampState.findByPk(rampId)) as RampState;
    const quote = (await QuoteTicket.findByPk(ramp.quoteId)) as QuoteTicket;
    const signed = Object.fromEntries(
      (ramp.presignedTxs ?? []).filter(tx => typeof tx.txData === "string").map(tx => [tx.phase, tx.txData])
    ) as Record<string, `0x${string}`>;
    const ephemeral = ramp.state.evmEphemeralAddress as `0x${string}`;
    return { ephemeral, ledger: new TokenLedger(world.evm, NVDA_USD, ephemeral), quote, ramp, signed };
  }

  /** The Pix is paid and Avenia mints. Broadcasts follow the ledger, Nabla trades at its quote, and Relay fills what it pulled. */
  async function scriptPaidBuy(rampId: string): Promise<void> {
    const { ephemeral, ledger, quote, signed } = await rampFacts(rampId);
    const nabla = getBlockMetadata(quote.metadata, NablaSwapContext);
    const { mint } = getBlockMetadata(quote.metadata, AveniaMintContext);
    const { bridge } = getBlockMetadata(quote.metadata, StockRouteContext);
    world.brla.onPixOutputTicket = ({ walletAddress }) => {
      if (walletAddress) {
        ledger.credit(
          Networks.Base,
          BRLA_ON_BASE,
          walletAddress,
          parseUnits(new Big(mint.outputAmountDecimal).toFixed(2, 0), 18)
        );
      }
    };
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      if (tx.serialized === signed.nablaSwap) {
        const router = parseTransaction(tx.serialized as `0x${string}`).to as string;
        if (ledger.pull(tx, BRLA_ON_BASE, ephemeral, router, router, BigInt(nabla.inputAmountForSwapRaw))) {
          ledger.credit(Networks.Base, USDC_ON_BASE, ephemeral, BigInt(nabla.outputAmountRaw));
        }
      }
      if (tx.serialized === signed.relayBridge) {
        const { args } = decodeFunctionData({
          abi: DEPOSIT_ERC20_ABI,
          data: parseTransaction(tx.serialized as `0x${string}`).data as `0x${string}`
        });
        if (ledger.pull(tx, USDC_ON_BASE, ephemeral, RELAY_DEPOSITORY_ADDRESS, RELAY_DEPOSITORY_ADDRESS, args[2])) {
          ledger.credit(Networks.Robinhood, USDG_ON_ROBINHOOD, ephemeral, BigInt(bridge.outputAmountRaw));
        }
      }
    };
  }

  /** Broadcasts follow the ledger, Relay fills what reached its deposit address, and Nabla trades at its quote. */
  async function scriptSoldStock(rampId: string) {
    const { ephemeral, ledger, quote, ramp, signed } = await rampFacts(rampId);
    const nabla = getBlockMetadata(quote.metadata, NablaSwapContext);
    const { relayDepositAddress } = getBlockState<StockRouteState>(ramp.state, StockRouteContext);
    world.evm.onTransaction = tx => {
      ledger.apply(tx);
      if (tx.serialized === signed.uniswapSwap) {
        const deposited = world.evm.erc20Balance(Networks.Robinhood, USDG_ON_ROBINHOOD, relayDepositAddress as string);
        ledger.credit(Networks.Base, USDC_ON_BASE, ephemeral, (deposited * (10_000n - world.relay.feeBps)) / 10_000n);
      }
      if (tx.serialized === signed.nablaSwap) {
        const router = parseTransaction(tx.serialized as `0x${string}`).to as string;
        if (ledger.pull(tx, USDC_ON_BASE, ephemeral, router, router, BigInt(nabla.inputAmountForSwapRaw))) {
          ledger.credit(Networks.Base, BRLA_ON_BASE, ephemeral, BigInt(nabla.outputAmountRaw));
        }
      }
    };
    return { ephemeral, ledger, quote };
  }

  /** The phase processor is done with the ramp: finished, or out of retries on a hold. Nothing runs on under the next reset. */
  async function settled(rampId: string): Promise<RampState> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const ramp = (await RampState.findByPk(rampId)) as RampState;
      if (ramp.currentPhase !== "initial" && !ramp.processingLock.locked) return ramp;
      if (Date.now() > deadline) throw new Error(`Ramp stuck in ${ramp.currentPhase}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /** Tracks a started ramp as the flows do, with their signal and their onUpdate: the screen ends on the final state. */
  async function track({ adapter }: Page, rampId: string, walletAddress: string) {
    const updates: unknown[] = [];
    const final = await adapter.pollStatus(rampId, {
      intervalMs: 10,
      onUpdate: (update: unknown) => updates.push(update),
      signal: new AbortController().signal,
      timeoutMs: 10_000,
      walletAddress
    });
    expect(updates.at(-1)).toEqual(final);
    return final;
  }

  /** What the progress screen goes through over the phases the server really walked: each step, in order. */
  async function expectEveryProgressStep(rampId: string, direction: "BUY" | "SELL") {
    const { currentPhase, phaseHistory } = (await RampState.findByPk(rampId)) as RampState;
    let index = 0;
    const shown = ["initial", ...phaseHistory.map(({ phase }) => phase), currentPhase].map(phase => {
      index = stepFor(direction, phase, index);
      return stepsFor(direction)[index];
    });
    expect([...new Set(shown)]).toEqual([...stepsFor(direction)]);
  }

  const tokensOf = (holder: string) => world.evm.erc20Balance(Networks.Robinhood, NVDA, holder);

  function pauseIssuer(): () => void {
    let paused = true;
    const reads = world.evm.onReadContract;
    world.evm.onReadContract = (network, params) =>
      paused && params.functionName === "paused" && isAddressEqual(params.address, NVDA) ? true : reads?.(network, params);
    return () => {
      paused = false;
    };
  }

  /** A token that answers, and has no EIP-2612 permit. */
  function scriptTokenWithoutPermit(): void {
    const reads = world.evm.onReadContract;
    world.evm.onReadContract = (network, params) => {
      if (network === Networks.Robinhood && params.functionName === "nonces") {
        throw new ContractFunctionExecutionError(new ContractFunctionZeroDataError({ functionName: "nonces" }), {
          abi: params.abi as Abi,
          args: params.args as unknown[],
          functionName: "nonces"
        });
      }
      return reads?.(network, params);
    };
  }

  const ageRamp = (rampId: string, minutes: number) =>
    RampState.update({ createdAt: new Date(Date.now() - minutes * 60_000) }, { where: { id: rampId } });

  /** Tracks a started ramp the way the flows do. Whatever went wrong on the way: the buyer got exactly what they were promised. */
  async function expectDelivered(page: Page, rampId: string, quote: { tokenAmountWei: string }, walletAddress: string) {
    const final = await track(page, rampId, walletAddress);
    expect(final.classification).toBe("success");
    expect((await settled(rampId)).currentPhase).toBe("complete");
    expect(world.evm.revertedReceiptHashes.size).toBe(0);
    expect(tokensOf(walletAddress)).toBe(BigInt(quote.tokenAmountWei));
    expect(world.evm.nativeBalance(Networks.Robinhood, walletAddress)).toBe(config.stocks.gasReserveTargetWei);
    return final;
  }

  /** The Pix is paid: starts the ramp from this page and tracks it to delivery. */
  async function payAndExpectDelivered(page: Page, rampId: string, quote: { tokenAmountWei: string }, walletAddress: string) {
    await scriptPaidBuy(rampId);
    expect((await page.adapter.startRamp(rampId)).id).toBe(rampId);
    return expectDelivered(page, rampId, quote, walletAddress);
  }

  /** Tracks a started sell to its end: the chain took the permit exactly once, the ephemeral pulled all of it, and the Pix went out. */
  async function expectPaidOut(page: Page, rampId: string, walletAddress: string, ledger: TokenLedger, ephemeral: string) {
    const final = await track(page, rampId, walletAddress);
    expect(final.classification).toBe("success");
    const ramp = await settled(rampId);
    expect(ramp.currentPhase).toBe("complete");
    expect(world.evm.revertedReceiptHashes.size).toBe(0);
    expect(ledger.permitNonce(NVDA, walletAddress)).toBe(1n);
    expect(ledger.allowance(Networks.Robinhood, NVDA, walletAddress, ephemeral)).toBe(0n);
    expect(world.evm.sentTransactions.filter(tx => tx.from === FUNDING && tx.to === NVDA)).toHaveLength(1);
    expect(tokensOf(walletAddress)).toBe(0n);
    expect(ramp.state.payOutTicketId).toBeTruthy();
    return final;
  }

  /** The seller's permit was signed: starts the ramp from this page and tracks it to the payout. */
  async function startAndExpectPaidOut(page: Page, rampId: string, walletAddress: string) {
    const { ephemeral, ledger } = await scriptSoldStock(rampId);
    await page.adapter.startRamp(rampId);
    return expectPaidOut(page, rampId, walletAddress, ledger, ephemeral);
  }

  const serverHistory = async ({ session }: Page) =>
    serverHistoryRows(await session.authenticatedApi("/v1/ramp/history?limit=20", { method: "GET" }), Networks.Robinhood);

  const rampKeysGone = (rampId: string) =>
    until(() => !indexedDb.stores.get("ramps")?.has(rampId), "the ramp's keys to be deleted");

  describe("a buy", () => {
    it("goes from availability to the exact quoted tokens on the wallet, through the Pix code and status polling", async () => {
      const wallet = createWallet();
      const page = createDevice().load();
      const { adapter, session, store } = page;
      await verifyEmail(page);
      expect(await adapter.getReadiness()).toEqual({ canBuy: false, canSell: false, kycStatus: "not_started" });
      await createTestTaxId(session.get().user_id, { taxId: TAX_ID });

      expect((await adapter.getAvailability()).NVDA).toEqual({ buy: true, reason: null, sell: true });
      const quote = await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
      expect(quote).toMatchObject({
        brlAmount: BOUGHT_BRL,
        direction: "BUY",
        simulated: false,
        symbol: "NVDA",
        tokenAddress: NVDA
      });
      expect(quote.gasReserve).not.toBeNull();
      expect(quoteNeedsRefresh(quote)).toBe(false);
      expect(await adapter.getReadiness()).toEqual({ canBuy: true, canSell: true, kycStatus: "approved" });

      const ramp = await adapter.registerBuy({ quote, walletAddress: wallet.address });
      expect(ramp).toMatchObject({
        classification: "awaiting_payment",
        currentPhase: "initial",
        direction: "BUY",
        symbol: "NVDA"
      });
      expect(Number(ramp.brlAmount)).toBe(BOUGHT_BRL);
      expect(parseUnits(ramp.tokenAmount, 18)).toBe(BigInt(quote.tokenAmountWei));
      expect(ramp.depositQrCode).toBe(world.brla.pixInputTickets.at(-1)?.brCode);
      expect(ramp.startDeadline).toBeGreaterThan(Date.now());
      expect(await adapter.getMaintenanceStatus()).toEqual({ active: false, details: null });
      expect(store.get(wallet.address)).toMatchObject({
        rampId: ramp.id,
        stage: "registered",
        symbol: "NVDA",
        tokenAddress: NVDA
      });
      expect(indexedDb.stores.get("ramps")?.has(ramp.id)).toBe(true);
      await expect(adapter.registerBuy({ quote, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "RAMP_IN_PROGRESS"
      });

      const final = await payAndExpectDelivered(page, ramp.id, quote, wallet.address);

      expect(final).toMatchObject({ symbol: "NVDA" });
      expect(parseUnits(final.tokenAmount, 18)).toBe(BigInt(quote.tokenAmountWei));
      expect(final.explorerLink).toBeTruthy();
      await expectEveryProgressStep(ramp.id, "BUY");
      // The device let go of the operation and lists it, as does the server history the app merges in.
      expect(store.get(wallet.address)).toBeNull();
      await rampKeysGone(ramp.id);
      const local = localHistoryRows(store.history(wallet.address));
      const server = await serverHistory(page);
      const row = expect.objectContaining({
        brlAmount: BOUGHT_BRL,
        direction: "BUY",
        id: ramp.id,
        status: "success",
        symbol: "NVDA"
      });
      expect(local).toEqual([row]);
      expect(server).toEqual([row]);
      expect(mergeHistory(local, server)).toHaveLength(1);
    });

    it("shows no Pix code when the server's answer sends the delivery to another wallet", async () => {
      const { page, quote, wallet } = await buyer();
      intercept = rewriting<{ unsignedTxs: UnsignedTx[] }>(
        path => path === "/v1/ramp/update",
        body => {
          for (const tx of body.unsignedTxs.filter(item => item.phase === "destinationTransfer")) {
            (tx.txData as { data: `0x${string}` }).data = encodeFunctionData({
              abi: erc20Abi,
              args: [ATTACKER, BigInt(quote.tokenAmountWei)],
              functionName: "transfer"
            });
          }
          return body;
        }
      );

      await expect(page.adapter.registerBuy({ quote, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "WRONG_ROUTE",
        message: expect.stringContaining("o código Pix não foi mostrado")
      });

      // No code can be paid, so the wallet is free again, and the operation stays listed for support.
      expect(page.store.get(wallet.address)).toBeNull();
      expect(page.store.history(wallet.address)).toEqual([expect.objectContaining({ status: "failure" })]);
    });

    it("whose registration fails at the update leaves the wallet free, and a fresh quote goes through", async () => {
      const { page, quote, wallet } = await buyer();
      intercept = (path, respond) =>
        path === "/v1/ramp/update"
          ? Promise.resolve(Response.json({ message: "Internal server error" }, { status: 500 }))
          : respond();

      await expect(page.adapter.registerBuy({ quote, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "SERVER_ERROR",
        message: "A operação não pôde ser concluída. Tente novamente em instantes."
      });
      expect(page.store.get(wallet.address)).toBeNull();

      intercept = undefined;
      await expect(page.adapter.registerBuy({ quote, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "INVALID_QUOTE",
        message: expect.stringContaining("cotação")
      });
      const next = await page.adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
      expect((await page.adapter.registerBuy({ quote: next, walletAddress: wallet.address })).classification).toBe(
        "awaiting_payment"
      );
    });

    it("cannot start after its window, and giving it up frees the wallet", async () => {
      const { page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });
      await ageRamp(ramp.id, 16);

      await expect(page.adapter.startRamp(ramp.id)).rejects.toMatchObject({
        code: "INVALID_QUOTE",
        message: expect.stringContaining("O prazo para iniciar esta operação terminou")
      });
      expect(page.store.get(wallet.address)).toMatchObject({ rampId: ramp.id });

      const current = await page.adapter.abandonRamp(ramp.id, { walletAddress: wallet.address });

      expect(current.currentPhase).toBe("initial");
      expect(page.store.get(wallet.address)).toBeNull();
      expect(page.store.history(wallet.address)).toEqual([
        expect.objectContaining({ rampId: ramp.id, status: "failure", symbol: "NVDA" })
      ]);
      const next = await page.adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
      expect((await page.adapter.registerBuy({ quote: next, walletAddress: wallet.address })).classification).toBe(
        "awaiting_payment"
      );
    });

    it("given up after the worker found the payment and started it stays tracked to delivery", async () => {
      const { page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });
      await scriptPaidBuy(ramp.id);
      await ageRamp(ramp.id, 16);
      const worker = new UnhandledPaymentWorker("*/15 * * * *", {
        runOnInit: false,
        slackNotifier: { sendMessage: async () => undefined } as never
      }) as unknown as { checkUnhandledPayments: () => Promise<void> };
      const unpause = pauseIssuer();
      await worker.checkUnhandledPayments();
      const { currentPhase } = await settled(ramp.id);
      expect(currentPhase).toBe("uniswapApprove");

      const current = await page.adapter.abandonRamp(ramp.id, { walletAddress: wallet.address });

      expect(current.currentPhase).toBe(currentPhase);
      expect(page.store.get(wallet.address)).toMatchObject({ rampId: ramp.id });
      unpause();
      await phaseProcessor.processRamp(ramp.id);
      await expectDelivered(page, ramp.id, quote, wallet.address);
      expect(page.store.history(wallet.address)).toEqual([expect.objectContaining({ rampId: ramp.id })]);
      expect(page.store.history(wallet.address)[0].status).toBeUndefined();
    });
  });

  describe("a sell", () => {
    it("goes from availability to the BRL payout, with a real permit the chain verifies and consumes", async () => {
      const wallet = createWallet();
      const page = createDevice().load();
      const { adapter, store } = page;
      await signIn(page);
      world.evm.setErc20Balance(Networks.Robinhood, NVDA, wallet.address, SOLD_RAW);

      expect((await adapter.getAvailability()).NVDA).toEqual({ buy: true, reason: null, sell: true });
      const quote = await adapter.quoteSell({ symbol: "NVDA", tokenAmount: SOLD, walletAddress: wallet.address });
      expect(quote).toMatchObject({
        direction: "SELL",
        gasless: true,
        gasReserve: null,
        symbol: "NVDA",
        tokenAmount: SOLD,
        tokenAmountWei: SOLD_RAW.toString()
      });
      expect(quoteNeedsRefresh(quote)).toBe(false);
      expect(await adapter.getReadiness()).toEqual({ canBuy: true, canSell: true, kycStatus: "approved" });

      const stages: string[] = [];
      const ramp = await adapter.registerSell({
        onRegistered: () => stages.push(store.get(wallet.address).stage),
        pixKey: `  ${PIX_KEY} `,
        quote,
        wallet: wallet.seam,
        walletAddress: wallet.address
      });

      expect(stages).toEqual(["signing"]);
      expect(wallet.requests).toEqual(["wallet_switchEthereumChain", SIGN]);
      expect(store.get(wallet.address)).toMatchObject({ rampId: ramp.id, stage: "ready", symbol: "NVDA", tokenAddress: NVDA });
      // Both the app and the SDK read the balance on the chain before registering.
      expect(chainReads.filter(name => name === "balanceOf")).toHaveLength(2);
      expect(tokensOf(wallet.address)).toBe(SOLD_RAW);

      const { ephemeral, ledger, quote: ticket } = await scriptSoldStock(ramp.id);
      expect(store.get(wallet.address).ephemeralEvmAddress).toBe(ephemeral);
      // The device holds the key that presigned, so a stuck ramp stays recoverable.
      const { ciphertext, iv } = indexedDb.stores.get("ramps")?.get(ramp.id) as { ciphertext: ArrayBuffer; iv: BufferSource };
      const deviceKey = indexedDb.stores.get("meta")?.get("device-aes-key") as CryptoKey;
      const keys = JSON.parse(
        new TextDecoder().decode(await crypto.subtle.decrypt({ iv, name: "AES-GCM" }, deviceKey, ciphertext))
      );
      const evmKey = keys.find((key: { type: string }) => key.type === "EVM");
      expect(privateKeyToAccount(evmKey.secret).address).toBe(ephemeral);

      await adapter.startRamp(ramp.id);
      const final = await expectPaidOut(page, ramp.id, wallet.address, ledger, ephemeral);

      expect(final.symbol).toBe("NVDA");
      expect(Number(final.brlAmount)).toBe(quote.brlAmount);
      expect(parseUnits(final.tokenAmount, 18)).toBe(SOLD_RAW);
      await expectEveryProgressStep(ramp.id, "SELL");
      expect((await RampState.findByPk(ramp.id))?.state.pixDestination).toBe(PIX_KEY);
      expect(world.brla.payoutQuoteAmounts.at(-1)).toBe(new Big(quote.brlAmount).round(2, 0).toString());
      const payout = getBlockMetadata(ticket.metadata, AveniaOfframpPayoutContext);
      expect(world.evm.erc20Balance(Networks.Base, BRLA_ON_BASE, world.brla.subaccountEvmWallet)).toBe(
        BigInt(payout.transferAmountRaw)
      );

      expect(store.get(wallet.address)).toBeNull();
      await rampKeysGone(ramp.id);
      const row = expect.objectContaining({
        brlAmount: quote.brlAmount,
        direction: "SELL",
        id: ramp.id,
        status: "success",
        symbol: "NVDA"
      });
      expect(localHistoryRows(store.history(wallet.address))).toEqual([row]);
      expect(await serverHistory(page)).toEqual([row]);
    });

    it("takes everything a buy delivered, to the wei, on the same device", async () => {
      const { page, quote: bought, wallet } = await buyer();
      const buy = await page.adapter.registerBuy({ quote: bought, walletAddress: wallet.address });
      await payAndExpectDelivered(page, buy.id, bought, wallet.address);

      const { positions } = await readPortfolio({ client: createRobinhoodClient(), owner: wallet.address });
      const balance = positions.find(({ symbol }: { symbol: string }) => symbol === "NVDA").raw;
      const tokenAmount = maxSellAmount(balance).replace(".", ","); // "Usar tudo", as the field holds it
      const quote = await page.adapter.quoteSell({ symbol: "NVDA", tokenAmount, walletAddress: wallet.address });
      expect(BigInt(quote.tokenAmountWei)).toBe(balance);
      const ramp = await page.adapter.registerSell({
        pixKey: PIX_KEY,
        quote,
        wallet: wallet.seam,
        walletAddress: wallet.address
      });

      await startAndExpectPaidOut(page, ramp.id, wallet.address);
    });

    it("whose permit expired unused fails on the device too, with the tokens home and the wallet free", async () => {
      const { device, page, register, wallet } = await seller();
      const ramp = await register();
      await scriptSoldStock(ramp.id);
      const unpause = pauseIssuer();
      await page.adapter.startRamp(ramp.id);
      expect((await settled(ramp.id)).currentPhase).toBe("stockPermitTransfer");
      unpause();
      const later = Date.now() + 2 * 60 * 60 * 1000;
      const clock = spyOn(Date, "now").mockImplementation(() => later);
      try {
        await phaseProcessor.processRamp(ramp.id);
      } finally {
        clock.mockRestore();
      }

      const { adapter, store } = device.load();
      expect((await adapter.getRamp(ramp.id, { walletAddress: wallet.address })).classification).toBe("failure");

      expect((await RampState.findByPk(ramp.id))?.currentPhase).toBe("failed");
      expect(tokensOf(wallet.address)).toBe(SOLD_RAW);
      expect(store.get(wallet.address)).toBeNull();
      expect(store.history(wallet.address)).toEqual([
        expect.objectContaining({ rampId: ramp.id, status: "failure", symbol: "NVDA" })
      ]);
    });

    it("turned down in the wallet can be continued, and completes", async () => {
      const { page, register, wallet } = await seller();
      wallet.controls.rejectNext = true;
      let rampId = "";

      await expect(
        register(ramp => {
          rampId = ramp.id;
        })
      ).rejects.toMatchObject({ code: 4001 });
      expect(page.store.get(wallet.address)).toMatchObject({ rampId, stage: "signing" });

      await page.adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address });

      expect(page.store.get(wallet.address)).toMatchObject({ rampId, stage: "ready" });
      await startAndExpectPaidOut(page, rampId, wallet.address);
    });

    it("of a token with no permit is refused at the quote, since this wallet signs nothing else", async () => {
      const wallet = createWallet();
      const page = createDevice().load();
      await signIn(page);
      scriptTokenWithoutPermit();

      await expect(
        page.adapter.quoteSell({ symbol: "NVDA", tokenAmount: SOLD, walletAddress: wallet.address })
      ).rejects.toMatchObject({
        code: "WRONG_ROUTE",
        message: expect.stringContaining("Nada foi registrado")
      });
    });

    async function expectRegisteredNothing({ store }: Page, wallet: ReturnType<typeof createWallet>): Promise<void> {
      expect(wallet.requests).toEqual([]);
      expect(store.get(wallet.address)).toBeNull();
      expect(await RampState.count()).toBe(0);
    }

    it("of a token whose permit went away after the quote registers nothing, in Portuguese", async () => {
      const { page, register, wallet } = await seller();
      scriptTokenWithoutPermit();

      await expect(register()).rejects.toMatchObject({
        code: "TOKEN_UNAVAILABLE",
        message: expect.stringContaining("Nada foi registrado"),
        status: 503
      });

      await expectRegisteredNothing(page, wallet);
    });

    it("registers nothing while the chain cannot say what the wallet holds, in Portuguese", async () => {
      const { page, register, wallet } = await seller();
      rpcDown = true;

      await expect(register()).rejects.toMatchObject({
        code: "SERVER_ERROR",
        message: "Não foi possível consultar a Robinhood Chain agora. Tente novamente em instantes."
      });

      await expectRegisteredNothing(page, wallet);
    });

    it("registers nothing for a wallet short of the tokens", async () => {
      const { page, register, wallet } = await seller();
      world.evm.setErc20Balance(Networks.Robinhood, NVDA, wallet.address, SOLD_RAW - 1n);

      await expect(register()).rejects.toMatchObject({
        code: "INSUFFICIENT_BALANCE",
        message: expect.stringContaining("Saldo de tokens insuficiente")
      });

      await expectRegisteredNothing(page, wallet);
    });

    it("refuses a Pix key in someone else's CPF, in Portuguese, with nothing to sign", async () => {
      const { page, register, wallet } = await seller(OTHER_TAX_ID);

      await expect(register()).rejects.toMatchObject({ code: "INVALID_QUOTE", message: expect.stringContaining("chave Pix") });

      await expectRegisteredNothing(page, wallet);
    });
  });

  describe("a tampered server: the wallet refuses and nothing is signed", () => {
    type Permit = SignedTypedData & { message: Record<string, string> };
    type RampBody = { unsignedTxs?: UnsignedTx[] };

    const tamperedPermits: [string, (permit: Permit) => unknown][] = [
      ["another spender", permit => ({ ...permit, message: { ...permit.message, spender: ATTACKER } })],
      [
        "another token",
        permit => ({ ...permit, domain: { ...permit.domain, verifyingContract: ROBINHOOD_STOCKS.AAPL.address } })
      ],
      ["a larger amount", permit => ({ ...permit, message: { ...permit.message, value: (SOLD_RAW + 1n).toString() } })],
      ["a smaller amount", permit => ({ ...permit, message: { ...permit.message, value: (SOLD_RAW - 1n).toString() } })],
      ["an unlimited allowance", permit => ({ ...permit, message: { ...permit.message, value: maxUint256.toString() } })],
      ["a far deadline", permit => ({ ...permit, message: { ...permit.message, deadline: "4000000000" } })],
      ["another owner", permit => ({ ...permit, message: { ...permit.message, owner: ATTACKER } })],
      ["another chain", permit => ({ ...permit, domain: { ...permit.domain, chainId: 1 } })],
      ["other typed data", permit => ({ ...permit, primaryType: "Order", types: { Order: permit.types.Permit } })],
      ["another primary type", permit => ({ ...permit, primaryType: "Order" })],
      [
        "a transfer in place of the permit",
        () => ({
          data: encodeFunctionData({ abi: erc20Abi, args: [ATTACKER, SOLD_RAW], functionName: "transfer" }),
          gas: "85000",
          to: NVDA,
          value: "0"
        })
      ]
    ];

    const tamperingPermit = (change: (permit: Permit) => unknown) => (body: RampBody) => {
      for (const tx of body.unsignedTxs ?? []) {
        if (tx.phase === "stockPermitTransfer" && (tx.txData as Permit).primaryType) {
          tx.txData = change(tx.txData as Permit) as UnsignedTx["txData"];
        }
      }
      return body;
    };

    async function expectNothingSigned(rampId: string, wallet: ReturnType<typeof createWallet>): Promise<void> {
      const ramp = (await RampState.findByPk(rampId)) as RampState;
      expect(wallet.requests).toEqual([]);
      expect(ramp.currentPhase).toBe("initial");
      expect((ramp.presignedTxs ?? []).filter(tx => tx.signer === wallet.address)).toEqual([]);
      expect(tokensOf(wallet.address)).toBe(SOLD_RAW);
      expect(world.evm.sentTransactions).toEqual([]);
    }

    it.each(tamperedPermits)("%s, at registration", async (_label, change) => {
      const { page, register, wallet } = await seller();
      intercept = rewriting(path => path === "/v1/ramp/update", tamperingPermit(change));
      let rampId = "";

      await expect(
        register(ramp => {
          rampId = ramp.id;
        })
      ).rejects.toMatchObject({
        code: "WALLET_REQUEST_REFUSED",
        message: expect.stringContaining("nada foi assinado")
      });

      await expectNothingSigned(rampId, wallet);
      // The operation stays on the device, so the flow can show its code.
      expect(page.store.get(wallet.address)).toMatchObject({ rampId, stage: "signing" });
    });

    it.each(tamperedPermits)("%s, on a resume", async (_label, change) => {
      const { device, registerUpToWalletPrompt, wallet } = await seller();
      const rampId = await registerUpToWalletPrompt();
      const { adapter } = device.load();
      wallet.requests.length = 0;
      intercept = rewriting(path => path.includes("showUnsignedTxs"), tamperingPermit(change));

      await expect(adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "WALLET_REQUEST_REFUSED"
      });

      await expectNothingSigned(rampId, wallet);
    });

    it("a second request alongside the permit", async () => {
      const { register, wallet } = await seller();
      intercept = rewriting<RampBody>(
        path => path === "/v1/ramp/update",
        body => ({
          ...body,
          unsignedTxs: [...(body.unsignedTxs ?? []), ...(body.unsignedTxs ?? []).filter(tx => tx.signer === wallet.address)]
        })
      );

      await expect(register()).rejects.toMatchObject({ code: "WRONG_ROUTE" });

      expect(wallet.requests).toEqual([]);
    });
  });

  describe("a page reload", () => {
    it("on the Pix screen shows the same code, and the buy completes from the new page", async () => {
      const { device, page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });

      const next = device.load();

      expect(next.store.get(wallet.address)).toMatchObject({ rampId: ramp.id, stage: "registered", symbol: "NVDA" });
      expect(await next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).toMatchObject({
        brlAmount: ramp.brlAmount,
        classification: "awaiting_payment",
        currentPhase: "initial",
        depositQrCode: ramp.depositQrCode,
        startDeadline: ramp.startDeadline,
        symbol: "NVDA"
      });
      await payAndExpectDelivered(next, ramp.id, quote, wallet.address);
      expect(next.store.get(wallet.address)).toBeNull();
    });

    it("while a buy is processing picks up the tracking, and the buy completes", async () => {
      const { device, page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });
      await scriptPaidBuy(ramp.id);
      const unpause = pauseIssuer();
      await page.adapter.startRamp(ramp.id);
      expect((await settled(ramp.id)).currentPhase).toBe("uniswapApprove");

      const next = device.load();

      expect(await next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).toMatchObject({
        classification: "processing",
        currentPhase: "uniswapApprove",
        symbol: "NVDA"
      });
      expect(next.store.get(wallet.address)).toMatchObject({ rampId: ramp.id });
      unpause();
      await phaseProcessor.processRamp(ramp.id);
      await expectDelivered(next, ramp.id, quote, wallet.address);
      expect(next.store.get(wallet.address)).toBeNull();
    });

    it("after a buy's registration died lets the wallet go, and a new buy goes through", async () => {
      const { device, page, quote, wallet } = await buyer();
      let updating = false;
      intercept = (path, respond) => {
        if (path !== "/v1/ramp/update") return respond();
        updating = true;
        return NEVER;
      };
      void page.adapter.registerBuy({ quote, walletAddress: wallet.address });
      await until(() => updating, "the update");

      intercept = undefined;
      const { adapter, store } = device.load();
      const { rampId } = store.get(wallet.address);
      expect(store.get(wallet.address).stage).toBe("registering");
      expect(indexedDb.stores.get("ramps")?.has(rampId)).toBe(true);
      expect(await adapter.getRamp(rampId, { walletAddress: wallet.address })).toMatchObject({
        currentPhase: "initial",
        depositQrCode: null
      });

      await adapter.abandonRamp(rampId, { walletAddress: wallet.address });

      expect(store.get(wallet.address)).toBeNull();
      expect(store.history(wallet.address)).toEqual([expect.objectContaining({ rampId, status: "failure", symbol: "NVDA" })]);
      const fresh = await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
      expect((await adapter.registerBuy({ quote: fresh, walletAddress: wallet.address })).classification).toBe(
        "awaiting_payment"
      );
    });

    it("after a sell's registration died lets the wallet go, with nothing asked of the wallet", async () => {
      const { device, register, wallet } = await seller();
      let updating = false;
      intercept = (path, respond) => {
        if (path !== "/v1/ramp/update") return respond();
        updating = true;
        return NEVER;
      };
      void register();
      await until(() => updating, "the update");

      intercept = undefined;
      const { adapter, store } = device.load();
      const { rampId, stage } = store.get(wallet.address);
      expect(stage).toBe("registering");
      expect(await adapter.getRamp(rampId, { walletAddress: wallet.address })).toMatchObject({ currentPhase: "initial" });

      await adapter.abandonRamp(rampId, { walletAddress: wallet.address });

      expect(wallet.requests).toEqual([]);
      expect(tokensOf(wallet.address)).toBe(SOLD_RAW);
      expect(store.get(wallet.address)).toBeNull();
      expect(store.history(wallet.address)).toEqual([expect.objectContaining({ rampId, status: "failure", symbol: "NVDA" })]);
    });

    it("in front of the wallet prompt asks again, and the sell completes", async () => {
      const { device, registerUpToWalletPrompt, wallet } = await seller();
      const rampId = await registerUpToWalletPrompt();

      const next = device.load();

      expect(next.store.get(wallet.address)).toMatchObject({ rampId, stage: "signing", symbol: "NVDA" });
      expect(await next.adapter.getRamp(rampId, { walletAddress: wallet.address })).toMatchObject({ currentPhase: "initial" });
      const resumed = await next.adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address });
      expect(resumed).toMatchObject({ currentPhase: "initial", id: rampId });
      expect(wallet.requests.filter(method => method === SIGN)).toHaveLength(2);
      expect(next.store.get(wallet.address)).toMatchObject({ rampId, stage: "ready" });
      await startAndExpectPaidOut(next, rampId, wallet.address);
      expect(next.store.get(wallet.address)).toBeNull();
    });

    it("after the signature reached the server but its answer did not signs once more, and the chain takes one permit", async () => {
      const { device, register, wallet } = await seller();
      let updates = 0;
      let delivered = false;
      intercept = answerLost(
        path => path === "/v1/ramp/update" && ++updates === 2,
        () => {
          delivered = true;
        }
      );
      let rampId = "";
      void register(ramp => {
        rampId = ramp.id;
      });
      await until(() => delivered, "the signature to reach the server");

      intercept = undefined;
      const next = device.load();
      expect(next.store.get(wallet.address)).toMatchObject({ rampId, stage: "signing" });
      await next.adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address });

      expect(wallet.requests.filter(method => method === SIGN)).toHaveLength(2);
      await startAndExpectPaidOut(next, rampId, wallet.address);
    });

    it("after signing but before the start signs nothing again, and the sell completes", async () => {
      const { device, register, wallet } = await seller();
      const ramp = await register();
      wallet.requests.length = 0;

      const next = device.load();

      expect(next.store.get(wallet.address)).toMatchObject({ rampId: ramp.id, stage: "ready" });
      const resumed = await next.adapter.resumeSell({ rampId: ramp.id, wallet: wallet.seam, walletAddress: wallet.address });
      expect(wallet.requests).toEqual([]);
      expect(resumed.currentPhase).toBe("initial");
      await startAndExpectPaidOut(next, ramp.id, wallet.address);
    });

    it("while a sell is processing signs nothing again, and the sell completes", async () => {
      const { device, page, register, wallet } = await seller();
      const ramp = await register();
      const { ephemeral, ledger } = await scriptSoldStock(ramp.id);
      const unpause = pauseIssuer();
      await page.adapter.startRamp(ramp.id);
      expect((await settled(ramp.id)).currentPhase).toBe("stockPermitTransfer");
      wallet.requests.length = 0;

      const next = device.load();
      const processing = { classification: "processing", currentPhase: "stockPermitTransfer" };

      expect(await next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).toMatchObject(processing);
      const resumed = await next.adapter.resumeSell({ rampId: ramp.id, wallet: wallet.seam, walletAddress: wallet.address });
      expect(resumed).toMatchObject(processing);
      expect(wallet.requests).toEqual([]);
      unpause();
      await phaseProcessor.processRamp(ramp.id);
      await expectPaidOut(next, ramp.id, wallet.address, ledger, ephemeral);
      expect(next.store.get(wallet.address)).toBeNull();
    });

    it("after the start reached the server but its answer did not tracks the sell to its end", async () => {
      const { device, page, register, wallet } = await seller();
      const ramp = await register();
      const { ephemeral, ledger } = await scriptSoldStock(ramp.id);
      let delivered = false;
      intercept = answerLost(
        path => path === "/v1/ramp/start",
        () => {
          delivered = true;
        }
      );
      void page.adapter.startRamp(ramp.id);
      await until(() => delivered, "the start to reach the server");

      intercept = undefined;
      const next = device.load();
      // A second start, as a flow that still reads "initial" sends, is answered with the ramp's progress.
      expect((await next.adapter.startRamp(ramp.id)).id).toBe(ramp.id);
      await expectPaidOut(next, ramp.id, wallet.address, ledger, ephemeral);
    });

    it("after a sell's start window signs nothing and frees the wallet", async () => {
      const { device, registerUpToWalletPrompt, wallet } = await seller();
      const rampId = await registerUpToWalletPrompt();
      await ageRamp(rampId, 16);
      wallet.requests.length = 0;

      const { adapter, store } = device.load();

      await expect(adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "SELL_EXPIRED",
        details: { broadcast: false, rampId },
        message: expect.stringContaining("nada saiu da sua carteira")
      });
      expect(wallet.requests).toEqual([]);
      expect(store.get(wallet.address)).toBeNull();
      expect(store.history(wallet.address)).toEqual([expect.objectContaining({ rampId, status: "failure" })]);
    });

    it("in a new tab asks for the e-mail code first, then resumes", async () => {
      const { device, page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });
      const { email } = page.session.get();

      device.closeTab();
      const next = device.load();

      expect(next.session.get()).toBeNull();
      await expect(next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).rejects.toMatchObject({
        code: "AUTH_REQUIRED"
      });
      expect(next.store.get(wallet.address)).toMatchObject({ rampId: ramp.id });
      await verifyEmail(next, email);
      expect(await next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).toMatchObject({
        classification: "awaiting_payment",
        depositQrCode: ramp.depositQrCode
      });
    });

    it("signed in as someone else says whose it is, and keeps the operation on the device", async () => {
      const { device, page, quote, wallet } = await buyer();
      const ramp = await page.adapter.registerBuy({ quote, walletAddress: wallet.address });

      device.closeTab();
      const next = device.load();
      await verifyEmail(next);

      await expect(next.adapter.getRamp(ramp.id, { walletAddress: wallet.address })).rejects.toMatchObject({
        code: "SERVER_ERROR",
        message: expect.stringContaining("outra conta"),
        status: 403
      });
      expect(next.store.get(wallet.address)).toMatchObject({ rampId: ramp.id, stage: "registered" });
    });

    it("on a device that does not know the sell signs nothing", async () => {
      const { page, registerUpToWalletPrompt, wallet } = await seller();
      const rampId = await registerUpToWalletPrompt();
      wallet.requests.length = 0;
      const other = createDevice().load();
      other.session.set(page.session.get());

      await expect(
        other.adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address })
      ).rejects.toMatchObject({
        code: "SELL_EXPIRED",
        details: { rampId }
      });

      expect(wallet.requests).toEqual([]);
    });
  });

  describe("the app's other states", () => {
    it("a switched-off corridor reaches coming soon, one direction at a time", async () => {
      const page = createDevice().load();
      const { adapter } = page;
      await signIn(page);

      config.stocks.enabledDirections = [RampDirection.BUY];

      expect((await adapter.getAvailability()).NVDA).toEqual({ buy: true, reason: null, sell: false });
      expect((await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA" })).direction).toBe("BUY");

      config.stocks.enabledDirections = [];
      const map = await adapter.getAvailability({ force: true });

      expect(Object.keys(map)).toHaveLength(Object.keys(ROBINHOOD_STOCKS).length);
      for (const entry of Object.values(map) as { reason: string }[]) {
        expect(entry).toEqual({ buy: false, reason: "not_enabled", sell: false } as never);
        expect(isComingSoon(entry.reason)).toBe(true);
        expect(UNAVAILABLE_COPY_PT[entry.reason]).toBe("Em breve");
      }
      expect(rampOpenState({ rampEnabled: true, rampKind: "vortex" }, map)).toBe(false);
      await expect(adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA" })).rejects.toMatchObject({
        code: "NETWORK_NOT_SUPPORTED"
      });
      await expect(adapter.quoteSell({ symbol: "NVDA", tokenAmount: SOLD })).rejects.toMatchObject({
        code: "NETWORK_NOT_SUPPORTED"
      });
    });

    it("an issuer pause reaches the app in Portuguese: at the quote, at registration and from its own chain read", async () => {
      const { page, register, wallet } = await seller();
      const { adapter } = page;
      const quoted = await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });
      const unpause = pauseIssuer();
      const paused = {
        code: "TOKEN_UNAVAILABLE",
        message: "Negociação pausada pelo emissor. Tente novamente mais tarde.",
        status: 503
      };

      await expect(
        adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address })
      ).rejects.toMatchObject(paused);
      await expect(
        adapter.quoteSell({ symbol: "NVDA", tokenAmount: SOLD, walletAddress: wallet.address })
      ).rejects.toMatchObject(paused);

      await expect(adapter.registerBuy({ quote: quoted, walletAddress: wallet.address })).rejects.toMatchObject(paused);
      await expect(register()).rejects.toMatchObject(paused);
      expect(wallet.requests).toEqual([]);
      expect(page.store.get(wallet.address)).toBeNull();
      expect(await RampState.count()).toBe(0);

      const flags = tokenFlags(await readPortfolio({ client: createRobinhoodClient(), owner: wallet.address }));
      expect(freshPauseReason(flags.NVDA)).toBe("paused");
      expect(freshPauseReason(flags.AAPL)).toBeNull();
      const available = withIssuerPauses(await adapter.getAvailability(), flags);
      expect(available.NVDA).toEqual({ buy: false, reason: "paused", sell: false });
      expect(available.AAPL).toEqual({ buy: true, reason: null, sell: true });
      expect(UNAVAILABLE_COPY_PT.paused).toBe("Negociação pausada pelo emissor");

      unpause();
      expect((await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address })).symbol).toBe(
        "NVDA"
      );
    });

    it("maintenance stops a registration and a wallet prompt, and the sell goes on once it ends", async () => {
      const { device, page, register, wallet } = await seller();
      const window = await MaintenanceSchedule.create({
        endDatetime: new Date(Date.now() + 3_600_000),
        isActiveConfig: true,
        messageToDisplay: "Back soon",
        startDatetime: new Date(Date.now() - 1000),
        title: "Upgrade"
      });
      const refused = { code: "MAINTENANCE_ACTIVE", message: expect.stringContaining("manutenção") };

      expect(await page.adapter.getMaintenanceStatus()).toMatchObject({ active: true, details: { title: "Upgrade" } });
      await expect(register()).rejects.toMatchObject(refused);
      expect(await RampState.count()).toBe(0);

      // It starts between the registration and the wallet prompt: the app reads it once for each.
      await window.update({ isActiveConfig: false });
      let reads = 0;
      intercept = async (path, respond) => {
        if (path === "/v1/maintenance/status" && ++reads === 2) await window.update({ isActiveConfig: true });
        return respond();
      };
      let rampId = "";
      await expect(
        register(ramp => {
          rampId = ramp.id;
        })
      ).rejects.toMatchObject(refused);
      expect(wallet.requests).not.toContain(SIGN);
      expect(page.store.get(wallet.address)).toMatchObject({ rampId, stage: "signing" });

      intercept = undefined;
      await window.update({ isActiveConfig: false });
      const next = device.load();
      await next.adapter.resumeSell({ rampId, wallet: wallet.seam, walletAddress: wallet.address });
      expect(wallet.requests).toContain(SIGN);
      expect(next.store.get(wallet.address)).toMatchObject({ rampId, stage: "ready" });
    });

    it("a review in flight reads as pending, a subaccount with no documents yet and a rejection as not started", async () => {
      const page = createDevice().load();
      await verifyEmail(page);
      const customer = await createTestTaxId(page.session.get().user_id, { taxId: TAX_ID });
      await customer.update({ status: VerificationStatus.InReview });
      const kycCase = await KycCase.create({
        customerEntityId: customer.customerEntityId,
        provider: "avenia",
        providerCustomerId: customer.id,
        status: VerificationStatus.InReview,
        type: "kyc"
      });

      expect(await page.adapter.getReadiness()).toEqual({ canBuy: false, canSell: false, kycStatus: "not_started" });

      await kycCase.update({ statusExternal: "PENDING" });

      expect(await page.adapter.getReadiness()).toEqual({ canBuy: false, canSell: false, kycStatus: "pending" });

      await customer.update({ status: VerificationStatus.Rejected });
      await kycCase.update({ status: VerificationStatus.Rejected, statusExternal: "REJECTED" });

      expect(await page.adapter.getReadiness()).toEqual({ canBuy: false, canSell: false, kycStatus: "not_started" });
    });

    it("registering without a session asks for the e-mail code and leaves nothing behind", async () => {
      const wallet = createWallet();
      const { adapter, store } = createDevice().load();
      const quote = await adapter.quoteBuy({ brlAmount: BOUGHT_BRL, symbol: "NVDA", walletAddress: wallet.address });

      await expect(adapter.registerBuy({ quote, walletAddress: wallet.address })).rejects.toMatchObject({
        code: "AUTH_REQUIRED"
      });

      expect(store.get(wallet.address)).toBeNull();
      expect(await RampState.count()).toBe(0);
    });
  });
});
