// Test doubles for the Vortex adapter: a fake SDK client (createClient), a fake OTP session, a fake
// KYC and a fake embedded wallet. Obviously fake values only ("fake-test-only"). Not a test file.
import { createActiveRampStore } from "@vortexfi/consumer-kit";
import { encodeFunctionData, parseAbi, parseUnits } from "viem";
import { STOCK_TOKENS } from "../src/lib/stocks.js";
import { WALLET, jsonMemory } from "./helpers.mjs";

export const NOW = Date.parse("2026-09-28T15:00:00Z");
export const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
export const TX_HASH = `0x${"ab".repeat(32)}`;
export const ROUTER = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
/** The EVM ephemeral the fake SDK "generates" for every ramp. */
export const EPHEMERAL = "0x1111111111111111111111111111111111111111";

const ERC20 = parseAbi(["function approve(address spender, uint256 amount)"]);
/** A user transaction as the SDK returns it (UnsignedTx): approve `amountWei` of `token` to the router. */
export const approveTx = ({ signer, amountWei, token = NVDA, phase = "squidRouterApprove" }) => ({
  phase, signer, network: "robinhood", txData: { to: token, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [ROUTER, BigInt(amountWei)] }), value: "0", gas: "150000" },
});

const ERC20_TRANSFER = parseAbi(["function transfer(address to, uint256 amount)"]);
/** The final delivery of a buy, as the API has the ephemeral presign it: `amountWei` of `token` to `to`. */
export const destinationTransferTx = ({ to, amountWei, token = NVDA, signer = EPHEMERAL, phase = "destinationTransfer" }) => ({
  phase, signer, network: "robinhood", txData: { to: token, data: encodeFunctionData({ abi: ERC20_TRANSFER, functionName: "transfer", args: [to, BigInt(amountWei)] }), value: "0", gas: "85000" },
});

const PERMIT_FIELDS = [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }];
/**
 * The request a stock sell asks of the seller's wallet: an EIP-2612 permit for this ramp's ephemeral, as the backend
 * issues it. The wallet reads the real clock, so the deadline does too, whatever the adapter's injected `now` says.
 */
export const permitTx = ({ signer, amountWei, token = NVDA, spender = EPHEMERAL, phase = "stockPermitTransfer", deadline = Math.floor(Date.now() / 1000) + 3600, nonce = "0" }) => ({
  phase, signer, network: "robinhood",
  txData: {
    domain: { chainId: 4663, name: "NVIDIA", verifyingContract: token, version: "1" },
    message: { deadline: String(deadline), nonce: String(nonce), owner: signer, spender, value: String(amountWei) },
    primaryType: "Permit",
    types: { Permit: PERMIT_FIELDS },
  },
});

/** A Vortex quote answering `request`. */
export function vortexQuote(request, overrides = {}) {
  const buy = request.rampType === "BUY";
  return {
    id: "quote-fake-test-only", rampType: request.rampType, from: request.from, to: request.to, network: request.network,
    inputAmount: request.inputAmount, inputCurrency: request.inputCurrency, outputCurrency: request.outputCurrency,
    outputAmount: buy ? "0.4260" : "1158.10", expiresAt: new Date(NOW + 60_000).toISOString(),
    networkFeeFiat: "0.30", processingFeeFiat: "3.75", partnerFeeFiat: "0.00", totalFeeFiat: "4.05", feeCurrency: "BRL", routingStrategy: "direct",
    ...(buy ? {} : { gasless: true }),
    sessionId: "session-fake-test-only", ...overrides,
  };
}

/**
 * A fake SDK. `statuses` is the sequence getRampStatus walks through (the last one repeats).
 * registerRamp calls the ephemeral-key callback like the real SDK does for BRL ramps. A buy comes back with
 * the delivery the API had the ephemeral presign (`registeredBuy` changes it), a sell asks for the seller's
 * permit for the quoted amount unless `unsignedTransactions` says otherwise. `presignError` fails it after the
 * keys are stored, where the real SDK presigns and updates the ramp.
 */
export function fakeSdk({ quote = (request) => vortexQuote(request), statuses, unsignedTransactions, registerError, presignError, registeredBuy, log = [] } = {}) {
  const calls = { created: 0, createQuote: [], registerRamp: [], startRamp: [], getRampStatus: [], submitUserTransactions: [] };
  let config = null;
  let registered = null;
  let statusIndex = 0;
  const client = {
    async createQuote(request) { calls.createQuote.push(request); return quote(request); },
    async registerRamp(raw, data) {
      calls.registerRamp.push({ raw, data });
      if (registerError) throw registerError;
      config.onBeforeEphemeralsStored?.("ramp-fake-1", EPHEMERAL);
      log.push("before-ephemerals");
      await config.ephemeralStore.put({ keys: "fake-test-only" }, "ramp-fake-1");
      if (presignError) throw presignError;
      registered = {
        id: "ramp-fake-1", type: raw.rampType, from: raw.from, to: raw.to, network: raw.network, currentPhase: "initial", status: "PENDING",
        inputAmount: raw.inputAmount, inputCurrency: raw.inputCurrency, outputAmount: raw.outputAmount, outputCurrency: raw.outputCurrency,
        quoteId: raw.id, createdAt: new Date(NOW).toISOString(),
        ...(raw.rampType === "BUY" ? {
          depositQrCode: "pix-code-fake-test-only",
          unsignedTxs: [destinationTransferTx({ to: data.destinationAddress, amountWei: parseUnits(raw.outputAmount, 18), token: STOCK_TOKENS.find((item) => item.symbol === raw.outputCurrency)?.address })],
          ...registeredBuy?.(raw, data),
        } : {}),
      };
      const sellPermit = raw.rampType === "SELL" ? [permitTx({ signer: data.walletAddress, amountWei: parseUnits(raw.inputAmount, 18) })] : [];
      return { rampProcess: registered, unsignedTransactions: unsignedTransactions ?? sellPermit };
    },
    async startRamp(rampId) { calls.startRamp.push(rampId); return { ...registered, id: rampId, currentPhase: "brlaOnrampMint" }; },
    async getRampStatus(rampId) {
      calls.getRampStatus.push(rampId);
      const sequence = statuses ?? [{ currentPhase: "complete", status: "COMPLETE" }];
      const step = sequence[Math.min(statusIndex, sequence.length - 1)];
      statusIndex += 1;
      return { ...(registered ?? { id: rampId, type: "BUY", inputCurrency: "BRL", outputCurrency: "NVDA", inputAmount: "500", outputAmount: "0.4260", createdAt: new Date(NOW).toISOString() }), id: rampId, ...step };
    },
    async submitUserTransactions(rampId, transactions, { sendTransaction, signTypedData }) {
      calls.submitUserTransactions.push({ rampId, transactions });
      for (const tx of transactions) {
        if (tx.txData.primaryType) await signTypedData(tx.txData, { payloadCount: 1, payloadIndex: 0, unsignedTransaction: tx });
        else await sendTransaction({ ...tx.txData, chainId: 4663 }, { unsignedTransaction: tx });
      }
    },
  };
  const createClient = async (cfg) => { calls.created += 1; config = cfg; return client; };
  return { client, calls, createClient, log };
}

/** A fake Vortex OTP session: authenticatedApi answers from `routes`. */
export function fakeSession(routes = {}) {
  const calls = [];
  return {
    calls,
    getFreshAccessToken: async () => "access-fake-test-only",
    async authenticatedApi(path) {
      calls.push(path);
      const answer = routes[path.split("?")[0]];
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(path) : answer;
    },
  };
}

/**
 * The recovery stores over fresh in-memory storage. The ephemeral store logs the active ramp's
 * stage at the moment the keys are stored (it must already be "registering").
 */
export function stores(log = []) {
  const { storage, backing } = jsonMemory();
  const activeRampStore = createActiveRampStore({ activeKey: "satoshi:stocks:active-ramp:v1", historyKey: "satoshi:stocks:history:v1", storage });
  const ephemeralStore = {
    put: async (keys, rampId) => { log.push(`put:${rampId}:${activeRampStore.get(WALLET)?.stage ?? "none"}`); },
    delete: async (rampId) => { log.push(`delete:${rampId}`); },
  };
  return { storage, backing, activeRampStore, ephemeralStore };
}

/**
 * A fake embedded wallet on Robinhood Chain that logs every provider call (and receipt waits). Its
 * public client also answers, unlogged, the fresh ETH and base-fee reads before a sell is registered
 * (`ethWei`, `gasPriceWei`: 1 ETH and the chain's 0.02 gwei floor unless given), eth_estimateGas and the
 * token's permit nonce (`permitNonce`, 0 unless given, as `permitTx` signs).
 */
export function fakeWallet(log = [], { ethWei = 10n ** 18n, gasPriceWei = 20_000_000n, permitNonce = 0n } = {}) {
  const provider = {
    async request({ method, params }) {
      log.push(method === "wallet_switchEthereumChain" ? `${method}:${params[0].chainId}` : method);
      switch (method) {
        case "wallet_switchEthereumChain": return null;
        case "eth_getBalance": return `0x${ethWei.toString(16)}`;
        case "eth_gasPrice": return "0x1";
        case "eth_estimateGas": return "0x5208";
        case "eth_sendTransaction": return TX_HASH;
        case "eth_signTypedData_v4": return "0xsignature-fake-test-only";
        default: throw new Error(`unexpected ${method}`);
      }
    },
  };
  const publicClient = {
    chain: { id: 4663 },
    async getBalance() { return ethWei; },
    async getGasPrice() { return gasPriceWei; },
    async readContract({ functionName }) { if (functionName === "nonces") return permitNonce; throw new Error(`unexpected ${functionName}`); },
    async request({ method }) { if (method === "eth_estimateGas") return "0x12d3e"; throw new Error(`unexpected ${method}`); },
    async waitForTransactionReceipt() { log.push("receipt"); return { status: "success" }; },
  };
  return { provider, publicClient };
}
