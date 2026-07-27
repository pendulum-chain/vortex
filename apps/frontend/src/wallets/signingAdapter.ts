import { SignedTypedData } from "@vortexfi/shared";
import type { Hex } from "viem";

export interface WalletTransactionRequest {
  chainId: number;
  data: Hex;
  gas?: bigint;
  to: Hex;
  value: bigint;
}

export interface EvmWalletSigningAdapter {
  address: Hex;
  kind: "external" | "privy_embedded";
  sendTransaction: (transaction: WalletTransactionRequest) => Promise<Hex>;
  signTypedData: (typedData: SignedTypedData) => Promise<Hex>;
  waitForTransaction: (hash: Hex, chainId: number) => Promise<Hex>;
}

let activeAdapter: EvmWalletSigningAdapter | null = null;

export function setActiveEvmWalletSigningAdapter(adapter: EvmWalletSigningAdapter | null): void {
  activeAdapter = adapter;
}

export function getActiveEvmWalletSigningAdapter(): EvmWalletSigningAdapter {
  if (!activeAdapter) {
    throw new Error("The selected EVM wallet is not ready to sign");
  }
  return activeAdapter;
}
