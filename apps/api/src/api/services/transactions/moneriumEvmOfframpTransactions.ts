import {
  createOfframpSquidrouterTransactionsToEvm,
  ERC20_EURE_POLYGON,
  EvmTokenDetails,
  EvmTransactionData,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../models/quoteTicket.model";
import { getFirstMoneriumLinkedAddress } from "../monerium";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { StateMetadata } from "../phases/meta-state-types";
import { encodeEvmTransactionData } from "./index";

export interface MoneriumOfframpTransactionParams {
  quote: QuoteTicketAttributes;
  userAddress?: string;
  moneriumAuthToken?: string;
}

export async function prepareMoneriumEvmOfframpTransactions({
  quote,
  userAddress,
  moneriumAuthToken
}: MoneriumOfframpTransactionParams): Promise<{
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<StateMetadata>;
}> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails) {
    throw new Error(`Input token details not found for ${quote.inputCurrency} on network ${fromNetwork}`);
  }
  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);

  if (!quote.metadata?.offrampAmountBeforeAnchorFees) {
    throw new Error("Quote metadata is missing offrampAmountBeforeAnchorFees");
  }

  const offrampAmountBeforeAnchorFeesUnits = new Big(quote.metadata.offrampAmountBeforeAnchorFees);
  const offrampAmountBeforeAnchorFeesRaw = multiplyByPowerOfTen(
    offrampAmountBeforeAnchorFeesUnits,
    outputTokenDetails.decimals
  ).toFixed(0, 0);

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  // Initialize state metadata
  stateMeta = {
    inputTokenPendulumDetails,
    outputAmountBeforeFinalStep: {
      raw: offrampAmountBeforeAnchorFeesRaw,
      units: offrampAmountBeforeAnchorFeesUnits.toFixed()
    },
    outputTokenPendulumDetails,
    outputTokenType: quote.outputCurrency
  };

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error("Offramp from Assethub not supported for Monerium");
  }

  if (!moneriumAuthToken) {
    throw new Error("Monerium Offramp requires a valid authorization token");
  }

  const moneriumEvmAddress = await getFirstMoneriumLinkedAddress(moneriumAuthToken);

  if (!moneriumEvmAddress) {
    throw new Error("No Address linked for Monerium.");
  }

  const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
    destinationAddress: moneriumEvmAddress,
    fromAddress: userAddress,
    fromNetwork, // By design, EUR.e offramp starts from Polygon.
    inputTokenDetails, // Always EUR.e for Monerium offramp.
    outputTokenDetails: {
      erc20AddressSourceChain: ERC20_EURE_POLYGON
    } as unknown as EvmTokenDetails,
    rawAmount: inputAmountRaw,
    toNetwork: Networks.Polygon
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 1,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  return { stateMeta, unsignedTxs }; // Return the unsigned transactions and state meta
}
