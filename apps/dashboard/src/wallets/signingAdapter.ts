import type { SignedTypedData } from "@vortexfi/shared";
import type { Hex } from "viem";

export interface WalletTransactionRequest {
  chainId: number;
  data: Hex;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  to: Hex;
  value: bigint;
}

export interface WalletSigningAdapter {
  address: Hex;
  kind: "external" | "cdp_embedded";
  sendTransaction: (transaction: WalletTransactionRequest) => Promise<Hex>;
  signTypedData: (typedData: SignedTypedData) => Promise<Hex>;
  waitForTransaction: (hash: Hex, chainId: number) => Promise<Hex>;
}

let activeAdapter: WalletSigningAdapter | null = null;

export function setActiveWalletSigningAdapter(adapter: WalletSigningAdapter | null): void {
  activeAdapter = adapter;
}

export function getActiveWalletSigningAdapter(): WalletSigningAdapter {
  if (!activeAdapter) {
    throw new Error("The selected wallet is not ready to sign");
  }
  return activeAdapter;
}
