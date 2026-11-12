import assert from "node:assert/strict";
import test from "node:test";
import { ethereum, robinhoodChain } from "../src/chains.js";
import { encodeFunctionData, maxUint256, parseAbi, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BROADCAST_PENDING, assertSellRequests, ensureChain, evmTransaction, sendEvmTransaction, submitWalletTransactions } from "../src/evm-wallet.js";

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
const EXPECT = { token, from: address, chainId: 4663, maxAmountWei: AMOUNT.toString(), spenders: [ROUTER], permitNonce: "0", phases: { squidRouterApprove: ["approve"], squidRouterNoPermitTransfer: ["transfer"], secondTransfer: ["transfer"], stockPermitTransfer: ["permit"] } };
const call = (functionName, args) => encodeFunctionData({ abi: ERC20, functionName, args });
const txTo = (to, data, phase = "squidRouterApprove") => ({ phase, signer: address, txData: { to, data, value: "0", gas: "150000" } });
const nowSeconds = () => Math.floor(Date.now() / 1000);
const PERMIT_FIELDS = [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }];
// As the backend issues it: domain keys sorted, deadline one hour out.
const PERMIT_DOMAIN = { chainId: 4663, name: "NVIDIA", verifyingContract: token, version: "1" };
const permitMessage = (overrides = {}) => ({ owner: address, spender: ROUTER, value: AMOUNT.toString(), nonce: "0", deadline: String(nowSeconds() + 3600), ...overrides });
const permit = (overrides = {}, phase = "stockPermitTransfer") => ({ phase, signer: address, txData: {
  domain: PERMIT_DOMAIN, types: { Permit: PERMIT_FIELDS }, primaryType: "Permit", message: permitMessage(), ...overrides,
} });
// What the SDK hands the wallet with includeDomainType: the same request plus the canonical domain type.
const CANONICAL_DOMAIN_TYPE = [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }];
const asSdkPayload = (txData) => ({ ...txData, types: { ...txData.types, EIP712Domain: CANONICAL_DOMAIN_TYPE } });
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
    await assert.rejects(callbacks.signTypedData({ domain: { chainId: 137 } }, { payloadCount: 1, unsignedTransaction: SELL[0] }), { code: "WALLET_REQUEST_REFUSED" });
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
  assert.throws(() => assertSellRequests([{ phase: "stockPermitTransfer", signer: address, txData: [permit().txData, permit().txData] }], EXPECT), { code: "WALLET_REQUEST_REFUSED" });
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
  refused([permit({ message: permitMessage({ spender: ATTACKER, value: maxUint256.toString(), deadline: "9999999999" }) })]);
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

test("a permit for this sale passes the policy, also with the domain type the SDK adds", () => {
  assert.doesNotThrow(() => assertSellRequests([permit()], EXPECT));
  assert.doesNotThrow(() => assertSellRequests([permit({ types: asSdkPayload(permit().txData).types })], EXPECT));
  assert.doesNotThrow(() => assertSellRequests([permit({ domain: { chainId: 4663, verifyingContract: token } })], EXPECT), "a token whose domain has only chain and contract");
  assert.doesNotThrow(() => assertSellRequests([permit({ message: permitMessage({ spender: ROUTER.toLowerCase() }) })], EXPECT), "addresses compare case-insensitively");
});

test("every field that decides what a permit allows is pinned to the policy", () => {
  const refused = (label, transaction, expect = EXPECT) => assert.throws(() => assertSellRequests([transaction], expect), (error) => error.code === "WALLET_REQUEST_REFUSED" && /nada foi assinado/.test(error.message), label);
  const withMessage = (overrides) => permit({ message: permitMessage(overrides) });
  refused("another spender", withMessage({ spender: ATTACKER }));
  refused("another owner", withMessage({ owner: ATTACKER }));
  refused("another token", permit({ domain: { ...PERMIT_DOMAIN, verifyingContract: OTHER_TOKEN } }));
  refused("a larger value", withMessage({ value: (AMOUNT + 1n).toString() }));
  refused("an unlimited value", withMessage({ value: maxUint256.toString() }));
  refused("a smaller value", withMessage({ value: (AMOUNT - 1n).toString() }));
  refused("a far-future deadline", withMessage({ deadline: String(nowSeconds() + 3901) }));
  refused("no real deadline", withMessage({ deadline: maxUint256.toString() }));
  refused("an expired deadline", withMessage({ deadline: String(nowSeconds() - 1) }));
  refused("a missing deadline", permit({ message: { owner: address, spender: ROUTER, value: AMOUNT.toString(), nonce: "0" } }));
  refused("an extra message field", permit({ message: permitMessage({ extra: "1" }) }));
  refused("an extra type", permit({ types: { Permit: PERMIT_FIELDS, Order: [{ name: "id", type: "uint256" }] } }));
  refused("another Permit type", permit({ types: { Permit: PERMIT_FIELDS.slice(0, 4) } }));
  refused("Permit fields in another order", permit({ types: { Permit: [PERMIT_FIELDS[1], PERMIT_FIELDS[0], ...PERMIT_FIELDS.slice(2)] } }));
  refused("a domain type that leaves the contract out", permit({ types: { Permit: PERMIT_FIELDS, EIP712Domain: CANONICAL_DOMAIN_TYPE.slice(0, 3) } }));
  refused("a wrong chain", permit({ domain: { ...PERMIT_DOMAIN, chainId: 1 } }));
  refused("no chain", permit({ domain: { name: "NVIDIA", verifyingContract: token, version: "1" } }));
  refused("a domain with a salt", permit({ domain: { ...PERMIT_DOMAIN, salt: `0x${"00".repeat(32)}` } }));
  refused("a phase not in the policy", permit({}, "squidRouterApprove"));
  refused("a phase nobody listed", permit({}, "somethingNew"));
  refused("another signer", { ...permit(), signer: ATTACKER });
  refused("another network", { ...permit(), network: "base" }, { ...EXPECT, network: "robinhood" });
  refused("no amount consented", permit(), { ...EXPECT, maxAmountWei: "0" });
  refused("another nonce", withMessage({ nonce: "1" }));
  refused("no nonce read", permit(), { ...EXPECT, permitNonce: undefined });
  refused("other typed data", permit({ primaryType: "PermitSingle" }));
  refused("a null primaryType", permit({ primaryType: null }));
  // Typed data carrying a transaction too: the SDK would sign it as typed data.
  refused("typed data with calldata", permit({ to: token, data: call("approve", [ROUTER, AMOUNT]), value: "0" }));
  const approve = txTo(token, call("approve", [ROUTER, AMOUNT]));
  refused("a transaction also shaped as other typed data", { ...approve, txData: { ...approve.txData, domain: { chainId: 1 }, types: { Order: [] }, primaryType: "Order", message: {} } });
});

test("a permit counts toward the amount the sale may move", () => {
  const twoPhases = { ...EXPECT, phases: { ...EXPECT.phases, secondApprove: ["approve"] } };
  assert.throws(() => assertSellRequests([txTo(token, call("approve", [ROUTER, 1n]), "secondApprove"), permit()], twoPhases), { code: "WALLET_REQUEST_REFUSED" });
  assert.throws(() => assertSellRequests([permit(), txTo(token, call("approve", [ROUTER, 1n]), "secondApprove")], twoPhases), { code: "WALLET_REQUEST_REFUSED" });
  assert.throws(() => assertSellRequests([permit(), permit()], EXPECT), { code: "WALLET_REQUEST_REFUSED" }, "one request per phase");
});

function permitClient(payloadFor = (tx) => asSdkPayload(tx.txData), context = {}) {
  const signatures = [];
  return { signatures, submitUserTransactions: async (rampId, transactions, callbacks) => {
    assert.equal(callbacks.includeDomainType, true);
    for (const tx of transactions) signatures.push(await callbacks.signTypedData(payloadFor(tx), { payloadCount: 1, payloadIndex: 0, unsignedTransaction: tx, ...context }));
  } };
}
const permitSubmission = (client, provider, overrides = {}) => submitWalletTransactions({ client, rampId: "r1", transactions: [permit()], expect: EXPECT, from: address, provider, chain: robinhoodChain, publicClient: okReceipt(), getCheckpoint: () => null, saveCheckpoint: () => { throw new Error("a permit has nothing to checkpoint"); }, ...overrides });

test("a permit is signed through the wallet, on the flow's chain, after the app's last check", async () => {
  const order = [];
  const provider = fakeProvider({ eth_signTypedData_v4: () => { order.push("sign"); return "0xsigned"; } });
  const client = permitClient();
  await permitSubmission(client, provider, { beforeSign: async () => { order.push("beforeSign"); } });
  assert.deepEqual(provider.calls[0], { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  assert.deepEqual(order, ["beforeSign", "sign"]);
  assert.deepEqual(client.signatures, ["0xsigned"]);
  const sign = provider.calls.find((call) => call.method === "eth_signTypedData_v4");
  assert.equal(sign.params[0], address);
  assert.deepEqual(JSON.parse(sign.params[1]), JSON.parse(JSON.stringify(asSdkPayload(permit().txData))), "the wallet reads a JSON string, with the canonical domain type");
  assert.ok(!provider.calls.some((call) => call.method === "eth_sendTransaction"), "signing a permit costs the seller no transaction");
});

test("a failed last check stops the signature", async () => {
  const provider = fakeProvider();
  await assert.rejects(permitSubmission(permitClient(), provider, { beforeSign: async () => { throw Object.assign(new Error("pausado"), { code: "MAINTENANCE_ACTIVE" }); } }), { code: "MAINTENANCE_ACTIVE" });
  assert.ok(!provider.calls.some((call) => call.method === "eth_signTypedData_v4"));
});

test("the signature handler holds what reaches it to the policy, whatever passed before it", async () => {
  const hostile = [
    ["another spender", (tx) => asSdkPayload({ ...tx.txData, message: permitMessage({ spender: ATTACKER }) })],
    ["other typed data", () => ({ domain: { chainId: 4663 }, types: { Order: [] }, primaryType: "Order", message: {} })],
    ["another domain type", (tx) => ({ ...tx.txData, types: { ...tx.txData.types, EIP712Domain: CANONICAL_DOMAIN_TYPE.slice(0, 3) } })],
  ];
  for (const [label, payloadFor] of hostile) {
    const provider = fakeProvider();
    await assert.rejects(permitSubmission(permitClient(payloadFor), provider), { code: "WALLET_REQUEST_REFUSED" }, label);
    assert.ok(!provider.calls.some((call) => call.method === "eth_signTypedData_v4"), label);
  }
  const provider = fakeProvider();
  await assert.rejects(permitSubmission(permitClient(undefined, { payloadCount: 2 }), provider), { code: "WALLET_REQUEST_REFUSED" }, "one signature per request");
  assert.ok(!provider.calls.some((call) => call.method === "eth_signTypedData_v4"));
  const otherPhase = fakeProvider();
  await assert.rejects(permitSubmission(permitClient(undefined, { unsignedTransaction: { phase: "somethingNew" } }), otherPhase), { code: "WALLET_REQUEST_REFUSED" });
  assert.ok(!otherPhase.calls.some((call) => call.method === "eth_signTypedData_v4"));
});

test("the signature recovers to the seller over the domain the token hashes, despite the backend's sorted keys", async () => {
  const seller = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  const message = permitMessage({ owner: seller.address });
  const provider = fakeProvider({ eth_signTypedData_v4: ([, json]) => seller.signTypedData(JSON.parse(json)) });
  const client = permitClient();
  await permitSubmission(client, provider, { from: seller.address, transactions: [{ ...permit({ message }), signer: seller.address }], expect: { ...EXPECT, from: seller.address } });
  const recovered = await recoverTypedDataAddress({ domain: { name: "NVIDIA", version: "1", chainId: 4663, verifyingContract: token }, types: { Permit: PERMIT_FIELDS }, primaryType: "Permit", message, signature: client.signatures[0] });
  assert.equal(recovered, seller.address);
});
