import {
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  ERC20_USDC_POLYGON,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmToken,
  isOnChainToken,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import { StateMetadata } from "../../../phases/meta-state-types";
import { getOutToken } from "../../../sep10/helpers";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer } from "../common/monerium";
import { MoneriumOnrampTransactionParams, OnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";

/**
 * Prepares all transactions for Alfredpay (USD) onramp to EVM chain.
 * This route handles: USD → Polygon (USDC/USDT) → EVM (final transfer)
 */
export async function prepareAlfredpayToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: OnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const evmEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral entry not found");
  }

  if (!quote.metadata.alfredpayMint?.outputAmountRaw) {
    throw new Error("Missing alfredpay raw mint amount in quote metadata");
  }

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork || toNetwork === Networks.AssetHub) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }

  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!outputTokenDetails || !isEvmToken(quote.outputCurrency)) {
    throw new Error(`Output token details not found for ${quote.outputCurrency} on network ${toNetwork}`);
  }

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address
  };

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromPolygonToEvm({
      destinationAddress, // TODO are we going to have another intermediate step here?
      fromAddress: evmEphemeralEntry.address,
      fromToken: ERC20_USDC_POLYGON,
      rawAmount: quote.metadata.alfredpayMint.outputAmountRaw,
      toNetwork,
      toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
    });

  let polygonAccountNonce = 0; // Starts fresh

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon, // Hardcoded to mint on Polygon
    nonce: polygonAccountNonce,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
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
