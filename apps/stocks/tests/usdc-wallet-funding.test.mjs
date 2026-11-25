import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc20Abi } from "viem";
import { BASE_USDC } from "../src/lib/vortex-stocks.js";
import { canReviewPendingTransfer, createUsdcWalletFunding } from "../src/lib/usdc-wallet-funding.js";

const owner = "0x00000000000000000000000000000000000000a1";
const from = "0x00000000000000000000000000000000000000b2";
const hash = `0x${"a".repeat(64)}`;
function setup() {
  const data = new Map();
  const storage = { get: (k, fallback) => data.get(k) ?? fallback, set: (k, v) => { data.set(k, v); return true; }, remove: k => data.delete(k) };
  const adapter = { readBaseBalance: async address => address === owner ? 5_000_000n : 50_000_000n, readFundingReceipt: async () => null };
  // As the browser's: one holder per key, and ifAvailable hands a second caller null.
  const held = new Set();
  const locks = { request: async (key, _options, fn) => {
    if (held.has(key)) return fn(null);
    held.add(key);
    try { return await fn({}); } finally { held.delete(key); }
  } };
  const calls = [];
  const answers = { eth_accounts: [from], eth_chainId: "0x2105", eth_sendTransaction: hash };
  const wallet = { address: from, switchChain: async id => assert.equal(id, 8453), getEthereumProvider: async () => ({
    async request({ method, params }) {
      if (method === "eth_sendTransaction") calls.push(params[0]);
      if (answers[method] instanceof Error) throw answers[method];
      return answers[method];
    },
  }) };
  const options = { storage, locks };
  return { data, adapter, options, funding: createUsdcWalletFunding(adapter, options), calls, answers,
    input: { owner, wallet, shortfall: 20_000_000n, required: 25_000_000n } };
}

test("external funding sends only the reviewed shortfall of pinned native Base USDC into the user's wallet", async () => {
  const f = setup();
  await f.funding.send(f.input);
  assert.equal(f.calls.length, 1);
  const tx = f.calls[0];
  assert.equal(tx.from, from);
  assert.equal(tx.to, BASE_USDC.address);
  assert.equal(tx.value, "0x0");
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(decoded.functionName, "transfer");
  assert.equal(decoded.args[0].toLowerCase(), owner);
  assert.equal(decoded.args[1], 20_000_000n);
  const reopened = createUsdcWalletFunding(f.adapter, f.options);
  await assert.rejects(reopened.send(f.input), { code: "TRANSFER_PENDING" });
  assert.equal(reopened.pending(owner).hash, hash);
  assert.equal(canReviewPendingTransfer(reopened.pending(owner)), false);
  await reopened.acknowledgeUnsent(owner, reopened.pending(owner));
  assert.equal(reopened.pending(owner).hash, hash);
  await reopened.check(owner);
  assert.ok(reopened.pending(owner));
  f.adapter.readFundingReceipt = async received => { assert.equal(received, hash); return "success"; };
  assert.equal(await reopened.check(owner), "success");
  assert.equal(reopened.pending(owner), null);
});

test("a missing receipt can only be cleared after an explicit review, and a confirmed send stays protected", async () => {
  const f = setup();
  await f.funding.send(f.input);
  f.funding.pending(owner).requestedAt = Date.now() - 5 * 60_000;
  assert.equal(canReviewPendingTransfer(f.funding.pending(owner)), true);
  f.adapter.readFundingReceipt = async () => "success";
  await f.funding.acknowledgeUnsent(owner, f.funding.pending(owner));
  assert.equal(f.funding.pending(owner).hash, hash);
  f.adapter.readFundingReceipt = async () => null;
  await f.funding.acknowledgeUnsent(owner, f.funding.pending(owner));
  assert.equal(f.funding.pending(owner), null);
  assert.equal(f.calls.length, 1);
});

test("a stale amount, unconfirmed incoming funds, an empty sender, and a changed account or network stop before broadcast", async () => {
  const f = setup();
  await assert.rejects(f.funding.send({ ...f.input, shortfall: 19_000_000n }), { code: "FUNDING_BALANCE_CHANGED" });
  f.adapter.readBaseBalance = async (_address, options) => options?.confirmed === false ? 10_000_000n : 5_000_000n;
  await assert.rejects(f.funding.send(f.input), { code: "FUNDING_BALANCE_CHANGED" });
  f.adapter.readBaseBalance = async () => 5_000_000n;
  await assert.rejects(f.funding.send(f.input), { code: "SENDER_BALANCE" });
  f.adapter.readBaseBalance = async address => address === owner ? 5_000_000n : 50_000_000n;
  f.answers.eth_accounts = [owner];
  await assert.rejects(f.funding.send(f.input), { code: "WRONG_ACCOUNT" });
  f.answers.eth_accounts = [from]; f.answers.eth_chainId = "0x1";
  await assert.rejects(f.funding.send(f.input), { code: "WRONG_ACCOUNT" });
  assert.equal(f.calls.length, 0);
  assert.equal(f.funding.pending(owner), null);
});

test("a definitive wallet rejection allows retry, but an interrupted prompt keeps the checkpoint", async () => {
  const f = setup();
  f.answers.eth_sendTransaction = Object.assign(new Error("Rejected"), { code: 4001 });
  await assert.rejects(f.funding.send(f.input), { code: 4001 });
  assert.equal(f.funding.pending(owner), null);
  f.answers.eth_sendTransaction = new Error("Wallet response lost");
  await assert.rejects(f.funding.send(f.input), /Wallet response lost/);
  assert.equal(f.funding.pending(owner).hash, null);
  await assert.rejects(f.funding.send(f.input), { code: "TRANSFER_PENDING" });
  assert.equal(f.calls.length, 2);
  await f.funding.acknowledgeUnsent(owner, f.funding.pending(owner));
  assert.equal(f.funding.pending(owner).hash, null, "the wallet may still show the request");
  f.funding.pending(owner).requestedAt = Date.now() - 60_000;
  assert.equal(canReviewPendingTransfer(f.funding.pending(owner)), true);
  await f.funding.acknowledgeUnsent(owner, f.funding.pending(owner));
  assert.equal(f.funding.pending(owner), null);
});

test("a WalletConnect rejection releases the checkpoint; any other failure does not", async () => {
  const f = setup();
  f.answers.eth_sendTransaction = Object.assign(new Error("User rejected."), { code: 5000 });
  await assert.rejects(f.funding.send(f.input), { code: 5000 });
  assert.equal(f.funding.pending(owner), null);
  for (const code of [-32002, -32603, -32000, 4900, undefined]) {
    f.answers.eth_sendTransaction = Object.assign(new Error("Not a rejection"), { code });
    await assert.rejects(f.funding.send(f.input), { message: "Not a rejection" });
    assert.equal(f.funding.pending(owner)?.hash, null, `code ${code}`);
    f.data.clear();
  }
  f.answers.eth_sendTransaction = null;
  await assert.rejects(f.funding.send(f.input), /No transaction hash/);
  assert.equal(f.funding.pending(owner).hash, null, "an answer without a hash");
});

test("the checkpoint names its sender and amount, and survives a reload", async () => {
  const f = setup();
  f.answers.eth_sendTransaction = new Error("Wallet response lost");
  await assert.rejects(f.funding.send(f.input), /Wallet response lost/);
  const [[, stored]] = [...f.data];
  const { from: sender, amount } = JSON.parse(JSON.stringify(stored));
  assert.deepEqual({ sender, amount }, { sender: from, amount: "20000000" });
});

test("a statement about one transfer never discards the one that replaced it", async () => {
  const f = setup();
  f.answers.eth_sendTransaction = new Error("Wallet response lost");
  await assert.rejects(f.funding.send(f.input), /Wallet response lost/);
  const checkpoint = f.funding.pending(owner);
  checkpoint.requestedAt = Date.now() - 6 * 60_000;
  await f.funding.acknowledgeUnsent(owner, { ...checkpoint, requestedAt: checkpoint.requestedAt - 1 });
  assert.ok(f.funding.pending(owner));
  await f.funding.acknowledgeUnsent(owner, { ...checkpoint, hash });
  assert.ok(f.funding.pending(owner));
  await f.funding.acknowledgeUnsent(owner, { ...checkpoint });
  assert.equal(f.funding.pending(owner), null);
});

test("money arriving from elsewhere never releases a request that may still be open", async () => {
  const f = setup();
  f.answers.eth_sendTransaction = new Error("Request expired");
  await assert.rejects(f.funding.send(f.input), /Request expired/);
  f.adapter.readBaseBalance = async address => address === owner ? 110_000_000n : 500_000_000n;
  await f.funding.check(owner);
  await assert.rejects(f.funding.send({ ...f.input, shortfall: 90_000_000n, required: 200_000_000n }), { code: "TRANSFER_PENDING" });
  assert.equal(f.calls.length, 1);
});

test("while a transfer waits in the wallet, a second tab can neither send nor discard it", async () => {
  const f = setup();
  let answer;
  f.answers.eth_sendTransaction = new Promise(resolve => { answer = resolve; });
  const sending = f.funding.send(f.input);
  while (!f.funding.pending(owner)) await new Promise(resolve => setImmediate(resolve));
  const tab = createUsdcWalletFunding(f.adapter, f.options);
  await assert.rejects(tab.send(f.input), { code: "TRANSFER_PENDING" });
  f.funding.pending(owner).requestedAt = Date.now() - 60_000;
  await assert.rejects(tab.acknowledgeUnsent(owner, f.funding.pending(owner)), { code: "TRANSFER_PENDING" });
  answer(hash);
  await sending;
  assert.equal(f.calls.length, 1);
  assert.equal(tab.pending(owner).hash, hash);
});

test("without Web Locks the transfer is never offered or requested", async () => {
  const f = setup();
  const funding = createUsdcWalletFunding(f.adapter, { ...f.options, locks: null });
  assert.equal(funding.supported, false);
  assert.throws(() => funding.send(f.input), { code: "MANUAL_FUNDING_REQUIRED" });
  assert.equal(f.calls.length, 0);
});

test("a closed checkout or unavailable recovery storage cannot request a transfer", async () => {
  const f = setup();
  await assert.rejects(f.funding.send({ ...f.input, isCurrent: () => false }), /Checkout closed/);
  f.options.storage.set = () => false;
  await assert.rejects(f.funding.send(f.input), { code: "MANUAL_FUNDING_REQUIRED" });
  assert.equal(f.calls.length, 0);
});
