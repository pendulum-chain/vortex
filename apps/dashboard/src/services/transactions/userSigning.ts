import { getNetworkId, isEvmTransactionData, type SignedTypedData, type UnsignedTx } from "@vortexfi/shared";
import { getAccount, sendTransaction, signTypedData, switchChain, waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Signs multiple typed data objects with the connected wallet and returns signature
 * objects. Ported from the widget's userSigning service.
 */
export async function signMultipleTypedData(typedDataArray: SignedTypedData[]): Promise<SignedTypedData[]> {
  const signedTypedDataArray: SignedTypedData[] = [];

  for (const typedData of typedDataArray) {
    const rawSignature = await signTypedData(wagmiConfig, {
      domain: typedData.domain,
      message: typedData.message,
      primaryType: typedData.primaryType,
      types: typedData.types
    });

    const v = parseInt(rawSignature.slice(130, 132), 16);
    const r = `0x${rawSignature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${rawSignature.slice(66, 130)}` as `0x${string}`;

    const deadline = typedData.message.deadline
      ? Number(typedData.message.deadline)
      : Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Default deadline to 24 hours

    signedTypedDataArray.push({
      ...typedData,
      signature: { deadline, r, s, v }
    });
  }

  return signedTypedDataArray;
}

/**
 * Signs and broadcasts an EVM transaction with the connected wallet, temporarily
 * switching chains when the transaction targets a different network. Ported from the
 * widget minus the Safe-wallet confirmation helper (plain receipt wait).
 */
export async function signAndSubmitEvmTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, txData } = unsignedTx;

  if (!isEvmTransactionData(txData)) {
    throw new Error("Invalid EVM transaction data format for signing transaction");
  }

  const targetChainId = getNetworkId(network);
  if (!targetChainId) {
    throw new Error(`Invalid network: ${network}. Unable to determine chain ID.`);
  }

  const account = getAccount(wagmiConfig);
  const originalChainId = account.chainId;
  if (!originalChainId) {
    throw new Error("No wallet connected or unable to determine current chain ID.");
  }

  const needsNetworkSwitch = originalChainId !== targetChainId;
  if (needsNetworkSwitch) {
    try {
      await switchChain(wagmiConfig, { chainId: targetChainId });
    } catch (_error) {
      throw new Error(
        `Failed to switch to network ${network} (chainId: ${targetChainId}). Please switch manually and try again.`
      );
    }
  }

  try {
    const gas = BigInt(txData.gas);
    const hash = await sendTransaction(wagmiConfig, {
      data: txData.data,
      ...(gas > 0n ? { gas } : {}),
      to: txData.to,
      value: BigInt(txData.value)
    });
    const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: targetChainId, hash });
    return receipt.transactionHash;
  } finally {
    if (needsNetworkSwitch) {
      // Best effort — a failed switch-back must not mask the transaction outcome.
      await switchChain(wagmiConfig, { chainId: originalChainId }).catch(() => undefined);
    }
  }
}
