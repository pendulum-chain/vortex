import { ISubmittableResult, Signer } from "@polkadot/types/types";
import { WalletAccount } from "@talismn/connect-wallets";
import {
  decodeSubmittableExtrinsic,
  getNetworkId,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  SignedTypedData,
  UnsignedTx
} from "@vortexfi/shared";
import { getAddress } from "viem";
import { config } from "../../config";
import { cdpWidgetConfig } from "../../wallets/config";
import { confirmEmbeddedWalletAction } from "../../wallets/embeddedWalletReview";
import { getActiveEvmWalletSigningAdapter } from "../../wallets/signingAdapter";
import { PolkadotNodeName, polkadotApiService } from "../api/polkadot.service";

/**
 * Signs multiple typed data objects and returns signature objects
 */
export async function signMultipleTypedData(
  typedDataArray: SignedTypedData[],
  expectedSigner: string
): Promise<SignedTypedData[]> {
  const adapter = getActiveEvmWalletSigningAdapter();
  if (getAddress(adapter.address) !== getAddress(expectedSigner)) {
    throw new Error("The selected wallet does not match the server-issued typed-data signer");
  }
  if (adapter.kind === "cdp_embedded" && typedDataArray.length > 0) {
    if (!cdpWidgetConfig.signingEnabled) {
      throw new Error("Embedded wallet signing is disabled in this environment");
    }
    confirmEmbeddedWalletAction("EIP-712 signature", {
      signer: expectedSigner,
      typedData: typedDataArray
    });
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

// Sign the transaction with the user's connected wallet.
// If the transaction network differs from the currently connected network,
// this function will temporarily switch to the target network.
export async function signAndSubmitEvmTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, txData } = unsignedTx;

  if (!isEvmTransactionData(txData)) {
    throw new Error("Invalid EVM transaction data format for signing transaction");
  }

  const targetChainId = getNetworkId(network);

  console.log("About to send transaction for phase", unsignedTx.phase);

  if (!targetChainId) {
    throw new Error(`Invalid network: ${network}. Unable to determine chain ID.`);
  }

  const adapter = getActiveEvmWalletSigningAdapter();
  if (getAddress(adapter.address) !== getAddress(unsignedTx.signer)) {
    throw new Error("The selected wallet does not match the server-issued transaction signer");
  }
  if (adapter.kind === "cdp_embedded") {
    if (!cdpWidgetConfig.signingEnabled) {
      throw new Error("Embedded wallet signing is disabled in this environment");
    }
    confirmEmbeddedWalletAction("EVM transaction", {
      chainId: targetChainId,
      network,
      phase: unsignedTx.phase,
      signer: unsignedTx.signer,
      transaction: txData
    });
  }
  const hash = await adapter.sendTransaction({
    chainId: targetChainId,
    data: txData.data,
    gas: BigInt(txData.gas),
    maxFeePerGas: txData.maxFeePerGas ? BigInt(txData.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: txData.maxPriorityFeePerGas ? BigInt(txData.maxPriorityFeePerGas) : undefined,
    nonce: txData.nonce,
    to: txData.to,
    value: BigInt(txData.value)
  });
  console.log("Transaction sent", hash);
  const confirmedHash = await adapter.waitForTransaction(hash, targetChainId);
  console.log("Transaction confirmed", confirmedHash);
  return confirmedHash;
}

/// Sign the transaction with the user's connected wallet. The api needs to be for the correct network.
export async function signAndSubmitSubstrateTransaction(unsignedTx: UnsignedTx, walletAccount: WalletAccount): Promise<string> {
  const { txData } = unsignedTx;

  if (isEvmTransactionData(txData) || isSignedTypedData(txData) || isSignedTypedDataArray(txData)) {
    throw new Error("Invalid Substrate transaction data format for signing transaction");
  }

  const node = config.isSandbox ? PolkadotNodeName.Paseo : PolkadotNodeName.AssetHub;
  const apiComponents = await polkadotApiService.getApi(node);
  if (!apiComponents?.api) {
    throw new Error("Missing api components for substrate transaction.");
  }

  const extrinsic = decodeSubmittableExtrinsic(txData, apiComponents.api);
  return new Promise((resolve, reject) => {
    let inBlockHash: string | null = null;

    extrinsic
      .signAndSend(
        walletAccount.address,
        {
          signer: walletAccount.signer as Signer
        },
        (submissionResult: ISubmittableResult) => {
          const { status, dispatchError } = submissionResult;

          if (status.isInBlock && !inBlockHash) {
            inBlockHash = status.asInBlock.toString();
          }

          if (status.isFinalized) {
            const hash = status.asFinalized.toString();

            // Try to find a 'system.ExtrinsicFailed' event
            if (dispatchError) {
              reject(new Error(`Substrate transaction execution failed: ${dispatchError.toString()}`));
            }

            resolve(hash);
          }
        }
      )
      .catch(error => {
        // Most likely, the user cancelled the signing process.
        console.error("Error signing and submitting transaction", error);
        reject(error instanceof Error ? error : new Error(`Error signing and submitting transaction: ${String(error)}`));
      });
  });
}
