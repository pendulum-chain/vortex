import { SignedTypedData } from "@vortexfi/shared";
import { getAccount, sendTransaction, signTypedData, switchChain } from "@wagmi/core";
import { waitForTransactionConfirmation } from "../helpers/safe-wallet/waitForTransactionConfirmation";
import { wagmiConfig } from "../wagmiConfig";
import { EvmWalletSigningAdapter, WalletTransactionRequest } from "./signingAdapter";

export function createExternalSigningAdapter(address: `0x${string}`): EvmWalletSigningAdapter {
  const originalChainByHash = new Map<`0x${string}`, number>();
  return {
    address,
    kind: "external",
    sendTransaction: async (transaction: WalletTransactionRequest) => {
      const account = getAccount(wagmiConfig);
      if (!account.chainId) {
        throw new Error("No wallet connected or unable to determine current chain ID.");
      }
      const originalChainId = account.chainId;
      const switched = originalChainId !== transaction.chainId;
      if (switched) {
        try {
          await switchChain(wagmiConfig, { chainId: transaction.chainId });
        } catch {
          throw new Error(`Failed to switch to chain ${transaction.chainId}. Please switch manually and try again.`);
        }
      }
      try {
        const hash = await sendTransaction(wagmiConfig, {
          data: transaction.data,
          ...(transaction.gas && transaction.gas > 0n ? { gas: transaction.gas } : {}),
          to: transaction.to,
          value: transaction.value
        });
        if (switched) originalChainByHash.set(hash, originalChainId);
        return hash;
      } catch (error) {
        if (switched) {
          await switchChain(wagmiConfig, { chainId: originalChainId }).catch(() => undefined);
        }
        throw error;
      }
    },
    signTypedData: (typedData: SignedTypedData) =>
      signTypedData(wagmiConfig, {
        domain: typedData.domain,
        message: typedData.message,
        primaryType: typedData.primaryType,
        types: typedData.types
      }),
    waitForTransaction: async (hash, chainId) => {
      try {
        return await waitForTransactionConfirmation(hash, chainId);
      } finally {
        const originalChainId = originalChainByHash.get(hash);
        originalChainByHash.delete(hash);
        if (originalChainId !== undefined) {
          await switchChain(wagmiConfig, { chainId: originalChainId }).catch(() => undefined);
        }
      }
    }
  };
}
