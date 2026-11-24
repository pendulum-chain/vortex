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
  const locks = { request: async (_key, _options, fn) => fn({}) };
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
  return { adapter, options, funding: createUsdcWalletFunding(adapter, options), calls, answers,
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
  await reopened.acknowledgeUnsent(owner);
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
  await f.funding.acknowledgeUnsent(owner);
  assert.equal(f.funding.pending(owner).hash, hash);
  f.adapter.readFundingReceipt = async () => null;
  await f.funding.acknowledgeUnsent(owner);
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
  await f.funding.acknowledgeUnsent(owner);
  assert.equal(f.funding.pending(owner), null);
});

test("a closed checkout or unavailable recovery storage cannot request a transfer", async () => {
  const f = setup();
  await assert.rejects(f.funding.send({ ...f.input, isCurrent: () => false }), /Checkout closed/);
  f.options.storage.set = () => false;
  await assert.rejects(f.funding.send(f.input), { code: "MANUAL_FUNDING_REQUIRED" });
  assert.equal(f.calls.length, 0);
});
