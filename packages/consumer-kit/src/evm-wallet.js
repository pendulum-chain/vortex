// Embedded-wallet signing for sells, lifted from Gold (apps/gold/src/lib/paxg.js and vortex.js)
// and generalised by chain: Gold hard-codes Ethereum (0x1), Stocks passes Robinhood Chain.
import { createPublicClient, custom, decodeFunctionData, formatUnits, getAddress, isAddressEqual, parseAbi, toHex } from "viem";
import { hexChainId } from "./chains.js";
import { VortexError } from "./vortex/api.js";
import { withConsumerLock } from "./consumer-lock.js";

const TX_FIELDS = ["value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "nonce"];
// Zero is no gas limit or fee cap at all: Vortex's direct transfers carry gas "0", and as "0x0" (a
// truthy string) it made the ETH preflight require nothing, so an empty wallet passed it.
const UNSET_WHEN_ZERO = ["gas", "gasPrice", "maxFeePerGas"];

const onOtherChain = (chainId, chain) => chainId != null && BigInt(chainId) !== BigInt(chain.id);

/**
 * Whitelists the fields sent to the wallet; throws if tx.chainId is set and is not chain.id. A zero
 * gas, gasPrice or maxFeePerGas is left out (unknown), never forwarded as "0x0".
 */
export function evmTransaction(transaction, from, chain) {
  if (onOtherChain(transaction.chainId, chain)) throw new Error(`A transação não pertence à rede ${chain.name}.`);
  const tx = { from: getAddress(from), to: getAddress(transaction.to), data: transaction.data || "0x" };
  for (const key of TX_FIELDS) {
    if (transaction[key] == null) continue;
    const value = BigInt(transaction[key]);
    if (value !== 0n || !UNSET_WHEN_ZERO.includes(key)) tx[key] = toHex(value);
  }
  return tx;
}

/**
 * The gas limit of a transaction without one, from eth_estimateGas on the chain's public client
 * (only from/to/data/value: with a fee cap, a node refuses to estimate for an empty wallet). The
 * estimate becomes the transaction's gas, so the preflight and the wallet check the same amount.
 * Fails closed: an estimate that fails or is zero throws GAS_ESTIMATE_FAILED and nothing is sent.
 */
async function estimateGas(client, tx, chain) {
  const call = { from: tx.from, to: tx.to, data: tx.data, ...(tx.value ? { value: tx.value } : {}) };
  const gas = await client.request({ method: "eth_estimateGas", params: [call] }).then(BigInt).catch(() => 0n);
  if (gas > 0n) return gas;
  throw new VortexError(`Não foi possível calcular a taxa de rede desta transação na rede ${chain.name}, e nada foi enviado. Tente novamente em alguns minutos.`, { code: "GAS_ESTIMATE_FAILED" });
}

export async function ensureChain(provider, chain) {
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId(chain) }] });
}

// Calls that approve, move or permit an ERC-20 (or approve every token of an operator).
const TOKEN_MOVES = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function increaseAllowance(address spender, uint256 addedValue)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function setApprovalForAll(address operator, bool approved)",
]);

const REFUSED = "A carteira recebeu um pedido que não corresponde a esta venda e nada foi assinado. Não tente de novo; consulte o suporte com o código da operação.";

const sameAddress = (a, b) => { try { return isAddressEqual(a, b); } catch { return false; } };

const PERMIT_FIELDS = "deadline,nonce,owner,spender,value";
const PERMIT_REQUEST_KEYS = "domain,message,primaryType,types";
const PERMIT_TYPE = JSON.stringify([
  { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
]);
const PERMIT_DOMAIN_TYPE = [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }];
const PERMIT_MAX_LIFETIME_S = 3900n; // the server issues now + 3600 s; 300 s covers clock skew
const sortedKeys = (object) => Object.keys(object).sort().join();

/**
 * An EIP-2612 permit is an allowance on the sold token, so every field that decides what it allows
 * is pinned to the policy: this chain, this token, this owner, a pinned spender, the exact amount,
 * a short deadline, and the nonce the app pinned for this sale (`permitNonce`), so every permit the
 * owner signs for it shares one nonce and the token executes at most one of them. Only name and
 * version stay free: a wrong one yields a signature the token rejects.
 */
function assertPermit(item, expect, phase) {
  let ok = false;
  try {
    const { domain, message, primaryType, types } = item;
    const { EIP712Domain, Permit, ...otherTypes } = types;
    const domainFields = PERMIT_DOMAIN_TYPE.filter(({ name }) => name in domain);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const deadline = BigInt(message.deadline);
    ok = sortedKeys(item) === PERMIT_REQUEST_KEYS
      && primaryType === "Permit"
      && JSON.stringify(Permit) === PERMIT_TYPE
      && Object.keys(otherTypes).length === 0
      && Object.keys(domain).length === domainFields.length
      && (EIP712Domain === undefined || JSON.stringify(EIP712Domain) === JSON.stringify(domainFields))
      && BigInt(domain.chainId) === BigInt(expect.chainId)
      && sameAddress(domain.verifyingContract, expect.token)
      && sortedKeys(message) === PERMIT_FIELDS
      && sameAddress(message.owner, expect.from)
      && expect.spenders.some((spender) => sameAddress(message.spender, spender))
      && BigInt(message.value) === BigInt(expect.maxAmountWei)
      && expect.permitNonce != null && BigInt(message.nonce) === BigInt(expect.permitNonce)
      && BigInt(expect.maxAmountWei) > 0n
      && deadline > now && deadline <= now + PERMIT_MAX_LIFETIME_S
      && expect.phases[phase]?.includes("permit") === true;
  } catch { /* malformed: refused below */ }
  if (!ok) throw new VortexError(REFUSED, { code: "WALLET_REQUEST_REFUSED", details: { phase: phase ?? null } });
}

/**
 * Code-owned signing policy, never derived from the API's unsigned requests. Accepts exact ERC-20
 * approve/transfer calls and EIP-2612 permits (assertPermit), each only in a phase the policy lists
 * for it. Other typed data, unknown router calls, allowance increments, native value, duplicate
 * phases and aggregate amounts beyond consent fail closed.
 */
export function assertSellRequests(transactions, expect) {
  const refuse = (phase) => { throw new VortexError(REFUSED, { code: "WALLET_REQUEST_REFUSED", details: { phase: phase ?? null } }); };
  if (!expect?.token || !expect.from || !expect.chainId || !expect.spenders?.length || !expect.phases || expect.maxAmountWei == null) refuse();
  let total = 0n;
  const phases = new Set();
  for (const tx of transactions || []) {
    const data = tx?.txData;
    if (!tx?.phase || phases.has(tx.phase) || !sameAddress(tx.signer, expect.from) || (expect.network && tx.network !== expect.network)) refuse(tx?.phase);
    phases.add(tx.phase);
    try {
      if (data?.primaryType !== undefined) { // the SDK treats anything shaped as typed data as a signature request
        assertPermit(data, expect, tx.phase);
        total += BigInt(data.message.value);
      } else {
        if (!data || Array.isArray(data) || !sameAddress(data.to, expect.token) || BigInt(data.value ?? 0) !== 0n || (data.from && !sameAddress(data.from, expect.from)) || (data.chainId != null && BigInt(data.chainId) !== BigInt(expect.chainId))) refuse(tx.phase);
        if (!/^0x[0-9a-fA-F]{136}$/.test(data.data || "")) refuse(tx.phase);
        const call = decodeFunctionData({ abi: TOKEN_MOVES, data: data.data });
        if (!["approve", "transfer"].includes(call.functionName) || !expect.phases[tx.phase]?.includes(call.functionName) || !expect.spenders.some((address) => sameAddress(address, call.args[0]))) refuse(tx.phase);
        total += BigInt(call.args[1]);
      }
      if (total > BigInt(expect.maxAmountWei) || BigInt(expect.maxAmountWei) <= 0n) refuse(tx.phase);
    } catch { refuse(tx.phase); }
  }
}

export const BROADCAST_PENDING = "broadcast-outcome-unknown";
const broadcastUnknown = () => new VortexError("O envio desta operação ainda precisa ser confirmado. Não envie novamente; consulte o suporte com o código da operação.", { code: "BROADCAST_OUTCOME_UNKNOWN" });

/**
 * Native-gas preflight, broadcast via eth_sendTransaction, onBroadcast(hash) BEFORE waiting, receipt
 * via publicClient (180 s), status check. With previousHash it skips broadcasting and only waits,
 * so a resumed operation never sends the same transaction twice. A failed preflight throws a
 * VortexError with code INSUFFICIENT_NATIVE_GAS and details {chainId, balanceWei, requiredWei}
 * (decimal strings), so an app can word it for its own case (e.g. Stocks' gas reserve). A missing
 * or zero gas limit is estimated first (estimateGas, fail closed with GAS_ESTIMATE_FAILED). A fee cap
 * in the transaction is checked as is; without one, gas is priced at 1.2 x eth_gasPrice.
 */
export async function sendEvmTransaction(provider, { chain, from, transaction, publicClient, previousHash, onBeforeBroadcast, onBroadcast, onRejected, beforeSign }) {
  if (previousHash === BROADCAST_PENDING) throw broadcastUnknown();
  const client = publicClient ?? createPublicClient({ chain, transport: custom(provider) });
  let hash = previousHash;
  if (!hash) {
    const tx = evmTransaction(transaction, from, chain);
    if (!tx.gas) tx.gas = toHex(await estimateGas(client, tx, chain));
    const balance = BigInt(await provider.request({ method: "eth_getBalance", params: [tx.from, "latest"] }));
    const cap = tx.maxFeePerGas || tx.gasPrice;
    const gas = BigInt(tx.gas);
    // Without a fee cap the wallet sets its own, 1.2 x the base fee (viem's default),
    // and the node refuses the transaction unless the ETH covers gas x that cap.
    const gasCost = cap ? gas * BigInt(cap) : (gas * BigInt(await provider.request({ method: "eth_gasPrice" })) * 12n) / 10n;
    const required = gasCost + BigInt(tx.value || 0);
    if (balance < required) {
      throw new VortexError(`Você precisa de ETH na rede ${chain.name} para a taxa de rede (estimativa: ${formatUnits(required, 18)} ETH). Adicione ETH na rede ${chain.name} ao endereço exibido e tente novamente.`, {
        code: "INSUFFICIENT_NATIVE_GAS", details: { chainId: chain.id, balanceWei: balance.toString(), requiredWei: required.toString() },
      });
    }
    await beforeSign?.();
    onBeforeBroadcast?.(); // Durable write-ahead marker: a lost response must never permit retry.
    try { hash = await provider.request({ method: "eth_sendTransaction", params: [tx] }); }
    catch (error) {
      if (Number(error?.code) === 4001) { onRejected?.(); throw error; }
      throw broadcastUnknown();
    }
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw broadcastUnknown();
    try { onBroadcast?.(hash); } catch { throw broadcastUnknown(); }
  }
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("A transação de rede falhou. Não confirme uma nova venda; consulte o suporte com o código da operação.");
  return hash;
}

/**
 * SDK submitUserTransactions with a policy-checked signTypedData and a checkpointed sendTransaction.
 * Checkpoints contain a hash, BROADCAST_PENDING for an uncertain send, or null. The pending
 * marker must be saved durably BEFORE eth_sendTransaction; saveCheckpoint must throw on failure.
 * The explicit code-owned policy (see assertSellRequests) covers the whole request batch.
 */
export async function submitWalletTransactions({ client, rampId, transactions, from, provider, chain, publicClient, getCheckpoint, saveCheckpoint, expect, beforeSign }) {
  if (!transactions?.length) return;
  if (!provider) throw new VortexError("A carteira Privy ainda não está pronta para confirmar a operação.", { code: "WALLET_NOT_READY" });
  if (typeof getCheckpoint !== "function" || typeof saveCheckpoint !== "function") throw new Error("submitWalletTransactions needs getCheckpoint and saveCheckpoint, or a resumed sell could broadcast twice.");
  const policy = { ...expect, from, chainId: chain.id };
  assertSellRequests(transactions, policy);
  await ensureChain(provider, chain);
  await client.submitUserTransactions(rampId, transactions, {
    includeDomainType: true,
    signTypedData: async (payload, context) => {
      if (context.payloadCount !== 1) throw new VortexError(REFUSED, { code: "WALLET_REQUEST_REFUSED", details: { phase: context.unsignedTransaction.phase } });
      assertPermit(payload, policy, context.unsignedTransaction.phase);
      await beforeSign?.();
      return provider.request({ method: "eth_signTypedData_v4", params: [getAddress(from), JSON.stringify(payload)] });
    },
    sendTransaction: async (transaction, context) => {
      const phase = context.unsignedTransaction.phase;
      const expected = transactions.find((tx) => tx.phase === phase);
      if (!expected || !sameAddress(transaction.to, expected.txData.to) || transaction.data !== expected.txData.data) throw new VortexError(REFUSED, { code: "WALLET_REQUEST_REFUSED" });
      assertSellRequests([{ ...expected, txData: transaction }], policy);
      return withConsumerLock(`vortex:send:${chain.id}:${from.toLowerCase()}:${rampId}:${phase}`, () => sendEvmTransaction(provider, { chain, from, transaction, publicClient, beforeSign, previousHash: getCheckpoint(rampId, phase) ?? null,
        onBeforeBroadcast: () => saveCheckpoint(rampId, phase, BROADCAST_PENDING), onBroadcast: (hash) => saveCheckpoint(rampId, phase, hash), onRejected: () => saveCheckpoint(rampId, phase, null) }));
    },
  });
}
