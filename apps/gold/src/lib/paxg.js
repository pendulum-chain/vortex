import { createPublicClient, custom, decodeFunctionData, formatUnits, getAddress, parseAbi, parseUnits, toHex } from "viem";
import { mainnet } from "viem/chains";

export const PAXG_ADDRESS = getAddress("0x45804880De22913dAFE09f4980848ECE6EcbAf78");
// Squid's router on Ethereum: the API builds a PAXG sell as an approve to it and a swap through it.
export const SQUID_ROUTER = getAddress("0xce16F69375520ab01377ce7B88f5BA8C48F8D666");
export const TROY_OUNCE_GRAMS = 31.1034768;
const PAXG_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const APPROVE_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

export async function readPaxgBalance(ethereumProvider, walletAddress) {
  if (!ethereumProvider || !walletAddress) return { paxg: 0, grams: 0 };
  const client = createPublicClient({ chain: mainnet, transport: custom(ethereumProvider) });
  const raw = await client.readContract({ address: PAXG_ADDRESS, abi: PAXG_ABI, functionName: "balanceOf", args: [getAddress(walletAddress)] });
  const paxg = Number(formatUnits(raw, 18));
  return { paxg, raw, grams: paxg * TROY_OUNCE_GRAMS };
}

export function gramsToPaxg(value) {
  // Integer arithmetic avoids overselling a small balance through floating-point rounding.
  const grams = parseUnits(String(value).replace(",", "."), 8);
  return formatUnits(grams * 10n ** 18n / 3110347680n, 18);
}

export async function assertSellBalance(provider, address, amount) {
  if (!provider || !address) throw new Error("Aguarde a preparação da sua carteira.");
  const balance = await readPaxgBalance(provider, address);
  if (parseUnits(String(amount), 18) <= 0n || balance.raw < parseUnits(String(amount), 18)) throw new Error("Saldo de ouro insuficiente. Atualize o saldo ou escolha um valor menor.");
}

// The wallet only signs a PAXG sell as the API builds it: approve at most the sold amount to the Squid
// router, then the router swap. The swap calldata is opaque, so the approval bounds what can be lost.
export function assertPaxgSellTransactions(transactions, { walletAddress, inputAmount }) {
  let valid = false;
  try {
    const [approve, swap] = transactions;
    const { functionName, args: [spender, amount] } = decodeFunctionData({ abi: APPROVE_ABI, data: approve.txData.data });
    valid = transactions.length === 2 && approve.phase === "squidRouterApprove" && swap.phase === "squidRouterSwap"
      && transactions.every((tx) => tx.network === "ethereum" && getAddress(tx.signer) === getAddress(walletAddress))
      && getAddress(approve.txData.to) === PAXG_ADDRESS && BigInt(approve.txData.value || 0) === 0n
      // decodeFunctionData ignores trailing bytes; approve(address,uint256) calldata is exactly 4 + 2 * 32 bytes.
      && approve.txData.data.length === 138 && functionName === "approve"
      && getAddress(spender) === SQUID_ROUTER && amount <= parseUnits(String(inputAmount), 18)
      && getAddress(swap.txData.to) === SQUID_ROUTER;
  } catch { valid = false; }
  if (!valid) throw new Error("As confirmações recebidas não correspondem a esta venda. Não confirme nada e consulte o suporte com o código da operação.");
}

export function ethereumTransaction(transaction, address) {
  if (transaction.chainId != null && BigInt(transaction.chainId) !== 1n) throw new Error("A transação não pertence à rede Ethereum.");
  const tx = { from: getAddress(address), to: getAddress(transaction.to), data: transaction.data || "0x" };
  for (const key of ["value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "nonce"]) if (transaction[key] != null) tx[key] = toHex(BigInt(transaction[key]));
  return tx;
}

export async function sendEthereumTransaction(provider, address, transaction, { previousHash, onBroadcast } = {}) {
  const client = createPublicClient({ chain: mainnet, transport: custom(provider) });
  let hash = previousHash;
  if (!hash) {
    const tx = ethereumTransaction(transaction, address);
    const balance = BigInt(await provider.request({ method: "eth_getBalance", params: [address, "latest"] }));
    const price = BigInt(tx.maxFeePerGas || tx.gasPrice || await provider.request({ method: "eth_gasPrice" }));
    const gas = BigInt(tx.gas || await provider.request({ method: "eth_estimateGas", params: [tx] }));
    const required = gas * price + BigInt(tx.value || 0);
    if (balance < required) throw new Error(`Você precisa de ETH na sua carteira para a taxa de rede (estimativa: ${formatUnits(required, 18)} ETH). Adicione ETH na rede Ethereum ao endereço exibido e tente novamente.`);
    hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
    onBroadcast?.(hash);
  }
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("A transação de rede falhou. Não confirme uma nova venda; consulte o suporte com o código da operação.");
  return hash;
}
