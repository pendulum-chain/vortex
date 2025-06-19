import {
  AccountMeta,
  EvmTokenDetails,
  Networks,
  UnsignedTx,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
} from '@packages/shared';

import Big from 'big.js';
import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { getFirstMoneriumLinkedAddress } from '../monerium';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { StateMetadata } from '../phases/meta-state-types';
import { encodeEvmTransactionData } from './index';
import { createOfframpSquidrouterTransactionsToEvm } from './squidrouter/offramp';

/**
 * TODO: implement for Monerium prototype?
 */
async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  return '';
}

export interface MoneriumOfframpTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  userAddress?: string;
  moneriumAuthToken?: string;
}

export async function prepareMoneriumEvmOfframpTransactions({
  quote,
  userAddress,
  moneriumAuthToken,
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

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency)!;
  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);

  if (!quote.metadata?.offrampAmountBeforeAnchorFees) {
    throw new Error('Quote metadata is missing offrampAmountBeforeAnchorFees');
  }

  const offrampAmountBeforeAnchorFeesUnits = new Big(quote.metadata.offrampAmountBeforeAnchorFees);
  const offrampAmountBeforeAnchorFeesRaw = multiplyByPowerOfTen(
    offrampAmountBeforeAnchorFeesUnits,
    outputTokenDetails.decimals,
  ).toFixed(0, 0);

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  // Initialize state metadata
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    outputAmountBeforeFinalStep: {
      units: offrampAmountBeforeAnchorFeesUnits.toFixed(),
      raw: offrampAmountBeforeAnchorFeesRaw,
    },
  };

  if (!userAddress) {
    throw new Error('User address must be provided for offramping.');
  }

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error('Offramp from Assethub not supported for Monerium');
  }

  if (!moneriumAuthToken) {
    throw new Error('Monerium Offramp requires a valid authorization token');
  }

  const moneriumEvmAddress = await getFirstMoneriumLinkedAddress(moneriumAuthToken);

  if (!moneriumEvmAddress) {
    throw new Error('No Address linked for Monerium.');
  }

  const { approveData, swapData } = await createOfframpSquidrouterTransactionsToEvm({
    inputTokenDetails,
    fromNetwork,
    toNetwork: Networks.Polygon, // By design, EUR.e offramp starts from Polygon.
    outputTokenDetails: {
      erc20AddressSourceChain: '0x18ec0a6e18e5bc3784fdd3a3634b31245ab704f6',
    } as unknown as EvmTokenDetails, // Always EUR.e for Monerium offramp.
    rawAmount: inputAmountRaw,
    destinationAddress: moneriumEvmAddress,
    fromAddress: userAddress,
  });

  unsignedTxs.push({
    txData: encodeEvmTransactionData(approveData) as any,
    phase: 'squidRouterApprove',
    network: fromNetwork,
    nonce: 0,
    signer: userAddress,
  });

  unsignedTxs.push({
    txData: encodeEvmTransactionData(swapData) as any,
    phase: 'squidRouterSwap',
    network: fromNetwork,
    nonce: 1,
    signer: userAddress,
  });

  return { unsignedTxs, stateMeta }; // Return the unsigned transactions and state meta
}
