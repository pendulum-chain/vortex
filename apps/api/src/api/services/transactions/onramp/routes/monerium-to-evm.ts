import {
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  ERC20_EURE_POLYGON,
  EvmTransactionData,
  isAssetHubTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { SANDBOX_ENABLED } from "../../../../../constants/constants";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";
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
    moneriumWalletAddress,
    walletAddress: destinationAddress
  };

  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, evmEphemeralEntry.address);
  const moneriumMintNetwork = SANDBOX_ENABLED ? Networks.PolygonAmoy : Networks.Polygon;

  unsignedTxs.push({
    meta: {},
    network: moneriumMintNetwork,
    nonce: 0,
    phase: "moneriumOnrampMint",
    signer: moneriumWalletAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

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
      fromToken: ERC20_EURE_POLYGON,
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
