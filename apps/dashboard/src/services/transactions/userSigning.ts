import { getNetworkId, isEvmTransactionData, type SignedTypedData, type UnsignedTx } from "@vortexfi/shared";
import { getAddress } from "viem";
import { getActiveWalletSigningAdapter } from "@/wallets/signingAdapter";

/**
 * Signs multiple typed data objects with the connected wallet and returns signature
 * objects. Ported from the widget's userSigning service.
 */
export async function signMultipleTypedData(
  typedDataArray: SignedTypedData[],
  expectedSigner: string
): Promise<SignedTypedData[]> {
  const adapter = getActiveWalletSigningAdapter();
  if (getAddress(adapter.address) !== getAddress(expectedSigner)) {
    throw new Error("The selected wallet does not match the server-issued typed-data signer");
  }
  const signedTypedDataArray: SignedTypedData[] = [];

  for (const typedData of typedDataArray) {
    const rawSignature = await adapter.signTypedData(typedData);

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

  const adapter = getActiveWalletSigningAdapter();
  if (getAddress(adapter.address) !== getAddress(unsignedTx.signer)) {
    throw new Error("The selected wallet does not match the server-issued transaction signer");
  }
  const hash = await adapter.sendTransaction({
    chainId: targetChainId,
    data: txData.data,
    gas: BigInt(txData.gas),
    to: txData.to,
    value: BigInt(txData.value)
  });
  return adapter.waitForTransaction(hash, targetChainId);
}
