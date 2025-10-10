import {
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  ERC20_EURE_POLYGON,
  EvmToken,
  EvmTransactionData,
  getNetworkId,
  getPendulumDetails,
  isAssetHubTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";
import { OnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";

/**
 * Prepares all transactions for a Monerium (EUR) onramp to EVM chain.
 * This route handles: EUR → Polygon (EURE) → EVM (final transfer)
 */
export async function prepareMoneriumToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: OnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails } = validateMoneriumOnramp(quote, signingAccounts);

  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for onramp.`);
  }

  if (!quote.metadata.moneriumMint?.outputAmountRaw) {
    throw new Error("Missing moonbeamToEvm output amount in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = new Big(quote.metadata.moneriumMint.outputAmountRaw).toFixed(0, 0);

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    walletAddress: destinationAddress
  };

  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, destinationAddress);

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "moneriumOnrampSelfTransfer",
    signer: destinationAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Polygon)) {
      let polygonAccountNonce = 0;

      const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
        inputAmountPostAnchorFeeRaw,
        destinationAddress,
        account.address
      );

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "moneriumOnrampSelfTransfer",
        signer: account.address,
        txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
      });

      const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromPolygonToEvm({
        destinationAddress,
        fromAddress: account.address,
        fromToken: ERC20_EURE_POLYGON,
        rawAmount: inputAmountPostAnchorFeeRaw,
        toNetwork,
        toToken: outputTokenDetails.erc20AddressSourceChain
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterApprove",
        signer: account.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterSwap",
        signer: account.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      });
    }
  }

  return { stateMeta, unsignedTxs };
}
