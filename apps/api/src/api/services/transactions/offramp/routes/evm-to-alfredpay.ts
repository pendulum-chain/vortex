import {
  createOfframpSquidrouterTransactionsToEvm,
  ERC20_USDC_POLYGON,
  EvmNetworks,
  EvmTokenDetails,
  EvmTransactionData,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmToken,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { addOnrampDestinationChainTransactions } from "../../onramp/common/transactions";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "../common/types";

/**
 * Prepares all transactions for an EVM to Alfredpay (USD) offramp.
 * This route handles: EVM → Polygon (USDC) → Alfredpay (Fiat)
 */
export async function prepareEvmToAlfredpayOfframpTransactions({
  quote,
  signingAccounts,
  userAddress
}: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  const evmEphemeralEntry = signingAccounts.find(account => account.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("EVM ephemeral account not found");
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails || !isEvmToken(quote.inputCurrency)) {
    throw new Error(`Input token details not found for ${quote.inputCurrency} on network ${fromNetwork}`);
  }

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!quote.metadata.alfredpayOfframp?.inputAmountRaw) {
    throw new Error("Missing alfredpayOfframp.inputAmountRaw in quote metadata");
  }

  const inputAmountRaw = new Big(quote.inputAmount).mul(new Big(10).pow(inputTokenDetails.decimals)).toFixed(0, 0);

  const bridgeResult = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: userAddress,
    fromNetwork,
    fromToken: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
    rawAmount: inputAmountRaw,
    toNetwork: Networks.Polygon,
    toToken: ERC20_USDC_POLYGON
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(bridgeResult.approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(bridgeResult.swapData) as EvmTransactionData
  });

  stateMeta = {
    ...stateMeta,
    evmEphemeralAddress: evmEphemeralEntry.address,
    squidRouterQuoteId: bridgeResult.squidRouterQuoteId,
    walletAddress: userAddress
  };

  const finalTransferTxData = await addOnrampDestinationChainTransactions({
    amountRaw: quote.metadata.alfredpayOfframp.inputAmountRaw,
    destinationNetwork: Networks.Polygon as EvmNetworks,
    toAddress: "0x0000000000000000000000000000000000000000", // placeholder
    toToken: ERC20_USDC_POLYGON
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "alfredpayOfframpTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalTransferTxData
  });

  return { stateMeta, unsignedTxs };
}
