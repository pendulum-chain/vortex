import {
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  ERC20_EURE_POLYGON_V1,
  EvmTransactionData,
  isAssetHubTokenDetails,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { SANDBOX_ENABLED } from "../../../../../constants/constants";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer } from "../common/monerium";
import { MoneriumOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";

/**
 * Prepares all transactions for a Monerium (EUR) onramp to EVM chain.
 * This route handles: EUR → Polygon (EURE) → EVM (final transfer)
 */
export async function prepareMoneriumToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  moneriumWalletAddress
}: MoneriumOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, evmEphemeralEntry } = validateMoneriumOnramp(quote, signingAccounts);

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
    evmEphemeralAddress: evmEphemeralEntry.address,
    moneriumWalletAddress,
    walletAddress: destinationAddress
  };

  const moneriumMintNetwork = SANDBOX_ENABLED ? Networks.PolygonAmoy : Networks.Polygon;

  let polygonAccountNonce = 0;

  const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
    inputAmountPostAnchorFeeRaw,
    moneriumWalletAddress,
    evmEphemeralEntry.address
  );

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "moneriumOnrampSelfTransfer",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
  });

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromPolygonToEvm({
      destinationAddress: moneriumWalletAddress,
      fromAddress: evmEphemeralEntry.address,
      fromToken: ERC20_EURE_POLYGON_V1,
      rawAmount: inputAmountPostAnchorFeeRaw,
      toNetwork,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: polygonAccountNonce++,
    phase: "squidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  stateMeta = {
    ...stateMeta,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
