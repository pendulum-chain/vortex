import { createPublicClient, custom, formatUnits, getAddress, parseAbi, parseUnits, toHex } from "viem";
import { mainnet } from "viem/chains";

export const PAXG_ADDRESS = getAddress("0x45804880De22913dAFE09f4980848ECE6EcbAf78");
export const TROY_OUNCE_GRAMS = 31.1034768;
const PAXG_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

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
