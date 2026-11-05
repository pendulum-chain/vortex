import assert from "node:assert/strict";
import test from "node:test";
import { ethereum, robinhoodChain } from "../src/chains.js";
import { encodeFunctionData, maxUint256, parseAbi } from "viem";
import { BROADCAST_PENDING, assertSellRequests, ensureChain, evmTransaction, guardTypedData, sendEvmTransaction, submitWalletTransactions } from "../src/evm-wallet.js";

const address = "0x0000000000000000000000000000000000000001";
const token = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
const HASH = `0x${"ab".repeat(32)}`;

function fakeProvider(replies = {}) {
  const calls = [];
  return {
    calls,
    request: async ({ method, params }) => {
      calls.push({ method, params });
      const reply = { eth_getBalance: "0xde0b6b3a7640000", eth_gasPrice: "0x1", eth_estimateGas: "0x5208", eth_sendTransaction: HASH, ...replies }[method];
      return typeof reply === "function" ? reply(params) : reply;
    },
  };
}

const ERC20 = parseAbi(["function approve(address spender, uint256 amount)", "function transfer(address to, uint256 amount)", "function transferFrom(address from, address to, uint256 amount)"]);
const ROUTER = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";
const ATTACKER = "0x000000000000000000000000000000000000dEaD";
const OTHER_TOKEN = "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5";
const AMOUNT = 5n * 10n ** 17n;
const EXPECT = { token, from: address, chainId: 4663, maxAmountWei: AMOUNT.toString(), spenders: [ROUTER], phases: { squidRouterApprove: ["approve"], squidRouterNoPermitTransfer: ["transfer"], secondTransfer: ["transfer"] } };
const call = (functionName, args) => encodeFunctionData({ abi: ERC20, functionName, args });
const txTo = (to, data, phase = "squidRouterApprove") => ({ phase, signer: address, txData: { to, data, value: "0", gas: "150000" } });
const permit = (overrides = {}) => ({ phase: "permit", signer: address, txData: {
  domain: { name: "NVIDIA", version: "1", chainId: 4663, verifyingContract: token },
  types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
  primaryType: "Permit", message: { owner: address, spender: ROUTER, value: AMOUNT.toString(), nonce: "0", deadline: "9999999999" }, ...overrides,
} });
const SELL = [txTo(token, call("approve", [ROUTER, AMOUNT]))];

/** The chain's public client: receipts, and eth_estimateGas (77,118 gas, unless `estimate` says otherwise). */
const okReceipt = (order = [], { estimate = async () => "0x12d3e" } = {}) => ({
  request: async ({ method, params }) => { order.push(`${method}:${JSON.stringify(params)}`); if (method === "eth_estimateGas") return estimate(params); throw new Error(`unexpected ${method}`); },
  waitForTransactionReceipt: async ({ hash }) => { order.push(`receipt:${hash}`); return { status: "success" }; },
});

test("the RPC transaction whitelist keeps known fields and rejects other chains (Gold, by chain)", () => {
  assert.deepEqual(evmTransaction({ to: token, value: "10", gas: 21000, chainId: 4663, unexpected: "omit" }, address, robinhoodChain), { from: address, to: token, data: "0x", value: "0xa", gas: "0x5208" });
  assert.throws(() => evmTransaction({ to: token, chainId: 1 }, address, robinhoodChain), /Robinhood Chain/);
  assert.throws(() => evmTransaction({ to: token, chainId: 137 }, address, ethereum), /Ethereum/);
  assert.deepEqual(evmTransaction({ to: token, chainId: "0x1237", data: "0x1234" }, address, robinhoodChain).data, "0x1234");
});

test("switches the embedded wallet to the flow's chain", async () => {
  const provider = fakeProvider();
  await ensureChain(provider, robinhoodChain);
  assert.deepEqual(provider.calls[0], { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
});

test("typed-data confirmations cannot switch away from the flow's chain", () => {
  assert.throws(() => guardTypedData({ domain: { chainId: 137 } }, robinhoodChain), /Robinhood Chain/);
  assert.throws(() => guardTypedData({ domain: { chainId: 1 } }, robinhoodChain), /Robinhood Chain/);
  assert.doesNotThrow(() => guardTypedData({ domain: { chainId: 4663 } }, robinhoodChain));
  assert.doesNotThrow(() => guardTypedData({ domain: { chainId: "0x1237" } }, robinhoodChain));
  assert.doesNotThrow(() => guardTypedData({ domain: {} }, robinhoodChain));
});

test("insufficient ETH is blocked before the transaction is broadcast", async () => {
  const provider = fakeProvider({ eth_getBalance: "0x0" });
  await assert.rejects(sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: { to: token }, publicClient: okReceipt() }), /Você precisa de ETH na rede Robinhood Chain/);
  assert.ok(!provider.calls.some((call) => call.method === "eth_sendTransaction"));
});

test("the gas preflight error carries a code and the amounts, so an app can word it", async () => {
  const provider = fakeProvider({ eth_getBalance: "0x10" });
  await assert.rejects(
    sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: { to: token, gas: "85000", maxFeePerGas: "25500000" }, publicClient: okReceipt() }),
    (error) => error.code === "INSUFFICIENT_NATIVE_GAS" && error.details.chainId === 4663 && error.details.balanceWei === "16"
      && error.details.requiredWei === (85000n * 25500000n).toString() && /Você precisa de ETH na rede Robinhood Chain/.test(error.message),
  );
  assert.ok(!provider.calls.some((call) => call.method === "eth_sendTransaction"));
});

// Vortex's direct-transfer intents carry gas "0". As "0x0" it was
// truthy, so the preflight required 0 ETH and an empty wallet passed it.
const TRANSFER_GAS_ZERO = { to: token, data: "0xa9059cbb", value: "0", gas: "0" };

test("a zero gas limit or fee cap is unknown, never forwarded as 0x0", () => {
  assert.deepEqual(evmTransaction({ to: token, gas: "0", gasPrice: 0, maxFeePerGas: "0x0" }, address, robinhoodChain), { from: address, to: token, data: "0x" });
  assert.deepEqual(evmTransaction({ to: token, value: "0", nonce: 0, maxPriorityFeePerGas: "0" }, address, robinhoodChain), { from: address, to: token, data: "0x", value: "0x0", nonce: "0x0", maxPriorityFeePerGas: "0x0" }, "zero value, nonce and tip are real values");
});

test("gas \"0\" with an empty wallet: estimated on the chain's public client, then blocked, nothing broadcast", async () => {
  const provider = fakeProvider({ eth_getBalance: "0x0", eth_gasPrice: "0x1312d00" }); // 0.02 gwei
  const order = [];
  await assert.rejects(
    sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: TRANSFER_GAS_ZERO, publicClient: okReceipt(order) }),
    (error) => error.code === "INSUFFICIENT_NATIVE_GAS" && error.details.balanceWei === "0" && error.details.requiredWei === ((77118n * 20000000n * 12n) / 10n).toString(),
  );
  assert.deepEqual(order, [`eth_estimateGas:${JSON.stringify([{ from: address, to: token, data: "0xa9059cbb", value: "0x0" }])}`], "no gas or fee fields in the estimate");
  assert.ok(!provider.calls.some((call) => call.method === "eth_sendTransaction"));
  assert.ok(!provider.calls.some((call) => call.method === "eth_estimateGas"), "the estimate is not asked of the wallet");
});

// Without a fee cap in the transaction the wallet sets its own (viem: 1.2 x the base fee) and the node refuses it unless the ETH covers gas x that cap. Priced at the bare eth_gasPrice,
// a wallet between 1.0x and 1.2x passed the preflight and failed in the wallet, without the app's wording.
test("without a fee cap, the preflight prices gas at the wallet's 1.2 x the base fee", async () => {
  const base = 20_000_000n; // 0.02 gwei
  const needed = (77_118n * base * 12n) / 10n;
  for (const [balance, blocked] of [[77_118n * base * 11n / 10n, true], [needed - 1n, true], [needed, false]]) {
    const provider = fakeProvider({ eth_getBalance: `0x${balance.toString(16)}`, eth_gasPrice: `0x${base.toString(16)}` });
    const send = sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: TRANSFER_GAS_ZERO, publicClient: okReceipt() });
    if (blocked) await assert.rejects(send, (error) => error.code === "INSUFFICIENT_NATIVE_GAS" && error.details.requiredWei === needed.toString(), String(balance));
    else assert.equal(await send, HASH);
    assert.equal(provider.calls.some((call) => call.method === "eth_sendTransaction"), !blocked, String(balance));
  }
  // A fee cap in the transaction is what the wallet uses: checked exactly, no margin on top.
  const capped = fakeProvider({ eth_getBalance: `0x${(85_000n * 25_500_000n).toString(16)}` });
  assert.equal(await sendEvmTransaction(capped, { chain: robinhoodChain, from: address, transaction: { ...TRANSFER_GAS_ZERO, gas: "85000", maxFeePerGas: "25500000" }, publicClient: okReceipt() }), HASH);
  assert.ok(!capped.calls.some((call) => call.method === "eth_gasPrice"));
});

test("gas \"0\" with a funded wallet: the wallet receives the estimate as the gas limit", async () => {
  const provider = fakeProvider();
  await sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: TRANSFER_GAS_ZERO, publicClient: okReceipt() });
  const sent = provider.calls.find((call) => call.method === "eth_sendTransaction").params[0];
  assert.equal(sent.gas, "0x12d3e");
  assert.equal(BigInt(sent.gas), 77118n);
  // Without gas at all, the same (the estimate is sent, the wallet does not guess its own).
  const other = fakeProvider();
  await sendEvmTransaction(other, { chain: robinhoodChain, from: address, transaction: { to: token }, publicClient: okReceipt() });
  assert.equal(other.calls.find((call) => call.method === "eth_sendTransaction").params[0].gas, "0x12d3e");
});

test("a failed or zero gas estimate fails closed before the wallet is asked", async () => {
  for (const estimate of [async () => { throw new Error("execution reverted"); }, async () => "0x0", async () => "not-a-number"]) {
    const provider = fakeProvider();
    await assert.rejects(
      sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: TRANSFER_GAS_ZERO, publicClient: okReceipt([], { estimate }) }),
      (error) => error.code === "GAS_ESTIMATE_FAILED" && /nada foi enviado/.test(error.message) && /Robinhood Chain/.test(error.message),
    );
    assert.deepEqual(provider.calls, [], "no balance read, no broadcast");
  }
});

test("the broadcast hash is checkpointed before the receipt wait", async () => {
  const order = [];
  const provider = fakeProvider();
  const hash = await sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: { to: token, chainId: 4663, gas: "85000" }, publicClient: okReceipt(order), onBroadcast: (value) => order.push(`broadcast:${value}`) });
  assert.equal(hash, HASH);
  assert.deepEqual(order, [`broadcast:${HASH}`, `receipt:${HASH}`]);
});

test("a resumed operation with a known hash only waits and never re-broadcasts", async () => {
  const provider = fakeProvider();
  const order = [];
  assert.equal(await sendEvmTransaction(provider, { chain: robinhoodChain, from: address, transaction: { to: token }, publicClient: okReceipt(order), previousHash: HASH, onBroadcast: () => order.push("broadcast") }), HASH);
  assert.deepEqual(provider.calls, []);
  assert.deepEqual(order, [`receipt:${HASH}`]);
});

test("a reverted transaction is reported, not treated as done", async () => {
  const reverted = { waitForTransactionReceipt: async () => ({ status: "reverted" }) };
  await assert.rejects(sendEvmTransaction(fakeProvider(), { chain: robinhoodChain, from: address, transaction: { to: token, gas: "85000" }, publicClient: reverted }), /A transação de rede falhou/);
});

test("wallet submission refuses unreviewed typed data and checkpoints before broadcast", async () => {
  const provider = fakeProvider();
  const checkpoints = new Map();
  const saved = [];
  const client = { submitUserTransactions: async (rampId, transactions, callbacks) => {
    assert.equal(callbacks.includeDomainType, true);
    await assert.rejects(callbacks.signTypedData({ domain: { chainId: 137 } }), { code: "WALLET_REQUEST_REFUSED" });
    await callbacks.sendTransaction(SELL[0].txData, { unsignedTransaction: SELL[0] });
  } };
  await submitWalletTransactions({ client, rampId: "r1", transactions: SELL, expect: EXPECT, from: address, provider, chain: robinhoodChain, publicClient: okReceipt(),
    getCheckpoint: (rampId, phase) => checkpoints.get(`${rampId}:${phase}`) ?? null,
    saveCheckpoint: (rampId, phase, hash) => saved.push([rampId, phase, hash]) });
  assert.deepEqual(provider.calls[0], { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  const signs = provider.calls.filter((call) => call.method === "eth_signTypedData_v4");
  assert.equal(signs.length, 0);
  assert.equal(provider.calls.filter((call) => call.method === "eth_sendTransaction").length, 1);
  assert.deepEqual(saved, [["r1", "squidRouterApprove", BROADCAST_PENDING], ["r1", "squidRouterApprove", HASH]]);
});

test("wallet submission fails closed without a wallet or without checkpoints", async () => {
  const client = { submitUserTransactions: async () => { throw new Error("must not be reached"); } };
  const base = { client, rampId: "r1", transactions: SELL, expect: EXPECT, from: address, chain: robinhoodChain, getCheckpoint: () => null, saveCheckpoint: () => {} };
  await assert.rejects(submitWalletTransactions({ ...base, provider: null }), { code: "WALLET_NOT_READY" });
  await assert.rejects(submitWalletTransactions({ ...base, provider: fakeProvider(), saveCheckpoint: undefined }), /getCheckpoint and saveCheckpoint/);
  await assert.rejects(submitWalletTransactions({ ...base, provider: fakeProvider(), expect: undefined }), { code: "WALLET_REQUEST_REFUSED" });
  await submitWalletTransactions({ ...base, provider: null, transactions: [] });
});

test("a reviewed sell may approve or transfer only the sold token to its pinned counterparty", () => {
  assert.doesNotThrow(() => assertSellRequests(SELL, EXPECT));
  assert.doesNotThrow(() => assertSellRequests([txTo(token, call("transfer", [ROUTER, AMOUNT]), "squidRouterNoPermitTransfer")], EXPECT));
  assert.doesNotThrow(() => assertSellRequests([txTo(token.toLowerCase(), call("approve", [ROUTER, AMOUNT - 1n]))], EXPECT), "addresses compare case-insensitively");
  assert.throws(() => assertSellRequests([permit()], EXPECT), { code: "WALLET_REQUEST_REFUSED" });
  assert.throws(() => assertSellRequests([{ phase: "permit", txData: [permit().txData, permit().txData] }], EXPECT), { code: "WALLET_REQUEST_REFUSED" });
  assert.doesNotThrow(() => assertSellRequests(SELL, { ...EXPECT, spenders: [ROUTER] }));
});

test("a hostile or mistaken wallet request is refused before the wallet is asked anything", async () => {
  const refused = (transactions, expect = EXPECT) => assert.throws(() => assertSellRequests(transactions, expect), (error) => error.code === "WALLET_REQUEST_REFUSED" && /nada foi assinado/.test(error.message));
  refused([txTo(token, call("approve", [ATTACKER, maxUint256]))]); // unlimited approval
  refused([txTo(token, call("approve", [ROUTER, AMOUNT + 1n]))]); // more than quoted
  refused([txTo(token, call("transfer", [ATTACKER, AMOUNT + 1n]))]);
  refused([txTo(token, call("transferFrom", [address, ATTACKER, 1n]))]);
  refused([txTo(token, "0x")]); // any other call on the token
  refused([txTo(OTHER_TOKEN, call("approve", [ROUTER, 1n]))]); // another token in the wallet
  refused([txTo(OTHER_TOKEN, call("transfer", [ATTACKER, 1n]))]);
  refused([txTo(token, call("approve", [ATTACKER, AMOUNT]))], { ...EXPECT, spenders: [ROUTER] });
  refused([permit({ message: { owner: address, spender: ATTACKER, value: maxUint256.toString(), nonce: "0", deadline: "9999999999" } })]);
  refused([permit({ domain: { chainId: 4663, verifyingContract: OTHER_TOKEN } })]);
  refused([permit({ primaryType: "PermitSingle" })]);
  refused([permit()], { ...EXPECT, spenders: [ATTACKER] });
  refused([{ phase: "x", txData: "0xdeadbeef" }]); // not an EVM request
  refused([{ phase: "x", txData: [] }]);
  refused([{ phase: "x" }]);
  const provider = fakeProvider();
  const client = { submitUserTransactions: async () => { throw new Error("must not be reached"); } };
  await assert.rejects(submitWalletTransactions({ client, rampId: "r1", transactions: [SELL[0], txTo(token, call("approve", [ATTACKER, maxUint256]))], expect: EXPECT, from: address, provider, chain: robinhoodChain, getCheckpoint: () => null, saveCheckpoint: () => {} }), { code: "WALLET_REQUEST_REFUSED" });
  assert.deepEqual(provider.calls, [], "no chain switch, no signature, no broadcast");
});
