import { defineChain } from "viem";
import { mainnet } from "viem/chains";

export const ROBINHOOD_CHAIN_ID = 4663; // 0x1237

export const ethereum = mainnet;

// viem 2.54.6 (installed) has no Robinhood Chain; newer viem releases ship one. Keep this
// definition until the catalog bumps, then compare it with viem's (chains.test.mjs pins the
// id and Multicall3 address). Source: docs.robinhood.com/chain/connecting.
export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

/** robinhoodChain -> "0x1237" */
export const hexChainId = (chain) => `0x${chain.id.toString(16)}`;

/** Same shape as @privy-io/chains addRpcUrlOverrideToChain (0.6.0), without the dependency. */
export const withRpcOverride = (chain, url) =>
  url ? { ...chain, rpcUrls: { ...chain.rpcUrls, privyWalletOverride: { http: [url] } } } : chain;

export const rpcUrl = (chain) => chain.rpcUrls.privyWalletOverride?.http[0] ?? chain.rpcUrls.default.http[0];

const EXPLORER_KINDS = ["tx", "address", "token"];

/** explorerUrl(robinhoodChain, "tx", hash) -> "https://robinhoodchain.blockscout.com/tx/<hash>" */
export function explorerUrl(chain, kind, value) {
  if (!EXPLORER_KINDS.includes(kind)) throw new Error(`Unknown explorer link kind "${kind}".`);
  const base = chain?.blockExplorers?.default?.url;
  if (!base || !value) return null;
  return `${base.replace(/\/$/, "")}/${kind}/${encodeURIComponent(value)}`;
}
