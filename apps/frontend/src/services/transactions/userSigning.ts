import { ApiPromise } from "@polkadot/api";
import { ISubmittableResult, Signer } from "@polkadot/types/types";
import { WalletAccount } from "@talismn/connect-wallets";
import { decodeSubmittableExtrinsic, getNetworkId, isEvmTransactionData, UnsignedTx } from "@vortexfi/shared";
import { Config, getAccount, sendTransaction, switchChain } from "@wagmi/core";
import { config } from "../../config";
import { waitForTransactionConfirmation } from "../../helpers/safe-wallet/waitForTransactionConfirmation";
import { wagmiConfig } from "../../wagmiConfig";
import { PolkadotNodeName, polkadotApiService } from "../api/polkadot.service";

// Sign the transaction with the user's connected wallet.
// If the transaction network differs from the currently connected network,
// this function will temporarily switch to the target network.
export async function signAndSubmitEvmTransaction(unsignedTx: UnsignedTx): Promise<string> {
  const { network, txData } = unsignedTx;

  if (!isEvmTransactionData(txData)) {
    throw new Error("Invalid EVM transaction data format for signing transaction");
  }

  const targetChainId = getNetworkId(network);

  const account = getAccount(wagmiConfig);
  const originalChainId = account.chainId;

  console.log("About to send transaction for phase", unsignedTx.phase);

  if (!targetChainId) {
    throw new Error(`Invalid network: ${network}. Unable to determine chain ID.`);
  }

  if (!originalChainId) {
    throw new Error("No wallet connected or unable to determine current chain ID.");
  }

  const needsNetworkSwitch = originalChainId !== targetChainId;

  if (needsNetworkSwitch) {
    console.log(`Switching from chain ${originalChainId} to chain ${targetChainId} for transaction`);
    try {
      await switchChain(wagmiConfig, { chainId: targetChainId });
    } catch (error) {
      console.error("Failed to switch chain:", error);
      throw new Error(
        `Failed to switch to network ${network} (chainId: ${targetChainId}). Please switch manually and try again.`
      );
    }
  }

  try {
    const hash = await sendTransaction(wagmiConfig, {
      data: txData.data,
      to: txData.to,
      value: BigInt(txData.value)
    });
    console.log("Transaction sent", hash);

    const confirmedHash = await waitForTransactionConfirmation(hash, targetChainId);
    console.log("Transaction confirmed", confirmedHash);

    // Switch back to original chain if we switched
    if (needsNetworkSwitch) {
      console.log(`Switching back to original chain ${originalChainId}`);
      try {
        await switchChain(wagmiConfig, { chainId: originalChainId });
      } catch (error) {
        console.warn("Failed to switch back to original chain:", error);
      }
    }

    return confirmedHash;
  } catch (error) {
    console.error("Transaction failed:", error);

    if (needsNetworkSwitch) {
      console.log(`Switching back to original chain ${originalChainId} after failure`);
      try {
        await switchChain(wagmiConfig, { chainId: originalChainId });
        console.log(`Successfully switched back to chain ${originalChainId}`);
      } catch (switchError) {
        console.warn("Failed to switch back to original chain after transaction failure:", switchError);
        // Preserve the original error
      }
    }

    throw error;
  }
}

/// Sign the transaction with the user's connected wallet. The api needs to be for the correct network.
export async function signAndSubmitSubstrateTransaction(unsignedTx: UnsignedTx, walletAccount: WalletAccount): Promise<string> {
  const { txData } = unsignedTx;

  if (isEvmTransactionData(txData)) {
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
              reject("Substrate transaction execution failed");
            }

            resolve(hash);
          }
        }
      )
      .catch(error => {
        // Most likely, the user cancelled the signing process.
        console.error("Error signing and submitting transaction", error);
        reject("Error signing and sending transaction:" + error);
      });
  });
}
