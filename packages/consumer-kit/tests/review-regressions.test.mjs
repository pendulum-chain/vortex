import assert from "node:assert/strict";
import test from "node:test";
import { createVortexSession } from "../src/vortex/session.js";
import { createBrazilKyc, isValidCpf, kycOutcome } from "../src/kyc-brazil.js";
import { BROADCAST_PENDING, assertSellRequests, submitWalletTransactions } from "../src/evm-wallet.js";
import { robinhoodChain } from "../src/chains.js";
import { withConsumerLock } from "../src/consumer-lock.js";
import { encodeFunctionData, parseAbi } from "viem";
import { memoryStorage } from "./helpers.mjs";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sessionFor = api => createVortexSession({ api, storage: () => memoryStorageBacking });
let memoryStorageBacking;
const A = { access_token: "fake-A", refresh_token: "refresh-A", privyDid: "did:test:A" };
const B = { access_token: "fake-B", refresh_token: "refresh-B", privyDid: "did:test:B" };

test("a delayed A 401 never refreshes B or retries A's mutation with B's token", async () => {
  memoryStorageBacking = memoryStorage(); const gate = deferred(), calls = [];
  const session = sessionFor(async (path, options, auth) => { calls.push({ path, auth }); await gate.promise; throw Object.assign(new Error("expired"), { status: 401 }); });
  session.set(A); const pending = session.authenticatedApi("/mutation", { method: "POST", body: "A-only" });
  await Promise.resolve(); session.clear(); session.set(B); gate.resolve();
  await assert.rejects(pending, { code: "SESSION_REPLACED" });
  assert.equal(calls.length, 1); assert.equal(calls[0].auth.token, "fake-A"); assert.equal(session.get().privyDid, B.privyDid);
});
test("late OTP success cannot resurrect logout or replace a newer login", async () => {
  for (const replacement of [null, B]) {
    memoryStorageBacking = memoryStorage(); const gate = deferred();
    const session = sessionFor(async () => { await gate.promise; return A; });
    const pending = session.verifyOtp("a@example.com", "123456", { privyDid: A.privyDid });
    session.clear(); if (replacement) session.set(replacement); gate.resolve();
    await assert.rejects(pending, { code: "SESSION_REPLACED" }); assert.equal(session.get()?.privyDid ?? null, replacement?.privyDid ?? null);
  }
});
test("an in-flight A refresh is not coalesced into a new B refresh", async () => {
  memoryStorageBacking = memoryStorage(); const gate = deferred(); const seen = [];
  const session = sessionFor(async (_, options) => { const token = JSON.parse(options.body).refresh_token; seen.push(token); if (token === A.refresh_token) await gate.promise; return { access_token: token, refresh_token: `${token}-next` }; });
  session.set(A); const old = session.refresh(); session.clear(); session.set(B);
  assert.equal((await session.refresh()).access_token, B.refresh_token); gate.resolve();
  await assert.rejects(old, { code: "SESSION_REPLACED" }); assert.deepEqual(seen, [A.refresh_token, B.refresh_token]);
});
test("KYC tolerates bounded network/404/409 reconciliation and ends expired attempts", async () => {
  for (const status of [0, 404, 409, 503]) {
    let calls = 0;
    const kyc = createBrazilKyc({ session: { authenticatedApi: async () => { if (++calls === 1) throw Object.assign(new Error("blip"), { status, code: status ? `HTTP_${status}` : "NETWORK_ERROR" }); return { status: "COMPLETED", result: "APPROVED" }; } } });
    assert.equal((await kyc.poll("fake", { intervalMs: 1 })).result, "APPROVED"); assert.equal(calls, 2);
  }
  let calls = 0;
  const unavailable = createBrazilKyc({ session: { authenticatedApi: async () => { calls++; throw Object.assign(new Error("reconciling"), { status: 409 }); } } });
  await assert.rejects(unavailable.poll("fake", { intervalMs: 1, maxConsecutiveErrors: 3 }), { code: "KYC_STATUS_UNAVAILABLE" }); assert.equal(calls, 3);
  const expired = createBrazilKyc({ session: { authenticatedApi: async () => ({ status: "EXPIRED" }) } });
  const result = await expired.poll("fake", { intervalMs: 1 }); assert.equal(result.status, "EXPIRED"); assert.match(kycOutcome(result).message, /Envie o documento/);
});
test("KYC ignores approval arriving after cancellation and explains blocked re-submission", async () => {
  const gate = deferred(), controller = new AbortController(); let updates = 0;
  const kyc = createBrazilKyc({ session: { authenticatedApi: async () => gate.promise } });
  const pending = kyc.poll("fake", { signal: controller.signal, onUpdate: () => updates++ });
  controller.abort(); gate.resolve({ result: "APPROVED" }); await assert.rejects(pending, { name: "AbortError" }); assert.equal(updates, 0);
  const blocked = createBrazilKyc({ session: { authenticatedApi: async () => { throw Object.assign(new Error("conflict"), { status: 409 }); } } });
  await assert.rejects(blocked.submit({}), { code: "KYC_NEW_ATTEMPT_BLOCKED" });
});
test("CPF validation matches Ouro's checksum and repeated/run-digit protections", () => {
  assert.equal(isValidCpf("000.000.001-91"), true);
  for (const cpf of ["00000000000", "11111111111", "01234567890", "12345678901", "123"]) assert.equal(isValidCpf(cpf), false);
});

const from = "0x0000000000000000000000000000000000000001", token = "0x0000000000000000000000000000000000000002", recipient = "0x0000000000000000000000000000000000000003";
const abi = parseAbi(["function transfer(address to,uint256 amount)"]);
const tx = (phase = "transfer", overrides = {}) => ({ phase, signer: from, network: "robinhood", txData: { to: token, data: encodeFunctionData({ abi, functionName: "transfer", args: [recipient, 10n] }), gas: "21000", ...overrides } });
const expect = { token, maxAmountWei: 10n, from, chainId: 4663, network: "robinhood", spenders: [recipient], phases: { transfer: ["transfer"], second: ["transfer"] } };
test("signing pins counterparties, selectors, phase, signer, chain, native value and aggregate consent", () => {
  assert.doesNotThrow(() => assertSellRequests([tx()], expect));
  for (const list of [[tx(), tx("second")], [tx(), tx()], [tx("unknown")], [tx("transfer", { value: "1" })], [tx("transfer", { chainId: 1 })], [tx("transfer", { to: recipient, data: "0xdeadbeef" })], [{ ...tx(), signer: recipient }], [{ ...tx(), network: "ethereum" }], [tx("transfer", { data: `${tx().txData.data}00` })]]) assert.throws(() => assertSellRequests(list, expect), { code: "WALLET_REQUEST_REFUSED" });
  assert.throws(() => assertSellRequests([tx()], { ...expect, spenders: [] }), { code: "WALLET_REQUEST_REFUSED" });
});
test("post-broadcast disk failure and lost RPC responses cannot broadcast again on resume", async () => {
  for (const lostResponse of [false, true]) {
    let checkpoint, broadcasts = 0;
    const provider = { request: async ({ method }) => { if (method === "eth_getBalance") return "0xffffffffffffffff"; if (method === "eth_gasPrice") return "0x1"; if (method === "eth_sendTransaction") { broadcasts++; if (lostResponse) throw new Error("response lost"); return `0x${"ab".repeat(32)}`; } } };
    const options = { client: { submitUserTransactions: async (_, txs, callbacks) => callbacks.sendTransaction(txs[0].txData, { unsignedTransaction: txs[0] }) }, rampId: "r", transactions: [tx()], from, expect, provider, chain: robinhoodChain,
      getCheckpoint: () => checkpoint, saveCheckpoint: (_, __, value) => { if (value !== BROADCAST_PENDING) throw new Error("disk full"); checkpoint = value; } };
    await assert.rejects(submitWalletTransactions(options), { code: "BROADCAST_OUTCOME_UNKNOWN" });
    await assert.rejects(submitWalletTransactions(options), { code: "BROADCAST_OUTCOME_UNKNOWN" }); assert.equal(broadcasts, 1);
  }
});

test("concurrent resumes of one ramp phase send once, then reuse its saved hash", async () => {
  let checkpoint, broadcasts = 0;
  const hash = `0x${"cd".repeat(32)}`;
  const provider = { request: async ({ method }) => { await Promise.resolve(); if (method === "eth_getBalance") return "0xffffffffffffffff"; if (method === "eth_gasPrice") return "0x1"; if (method === "eth_sendTransaction") { broadcasts++; return hash; } } };
  const options = { client: { submitUserTransactions: async (_, txs, callbacks) => callbacks.sendTransaction(txs[0].txData, { unsignedTransaction: txs[0] }) }, rampId: "concurrent-ramp", transactions: [tx()], from, expect, provider, chain: robinhoodChain,
    publicClient: { waitForTransactionReceipt: async () => ({ status: "success" }) }, getCheckpoint: () => checkpoint, saveCheckpoint: (_, __, value) => { checkpoint = value; } };
  await Promise.all([submitWalletTransactions(options), submitWalletTransactions(options)]);
  assert.equal(broadcasts, 1); assert.equal(checkpoint, hash);
});
test("browser execution refuses unavailable cross-tab locks", async () => {
  const previousWindow = globalThis.window, previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    globalThis.window = {}; Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await assert.rejects(withConsumerLock("fake", () => { throw new Error("must not run"); }), { code: "WALLET_LOCK_UNAVAILABLE" });
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else delete globalThis.navigator;
  }
});
