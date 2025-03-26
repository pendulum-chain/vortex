import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { createOfframpSquidrouterTransactions } from './squidrouter/offramp';
import { getNetworkFromDestination, getNetworkId, Networks } from '../../helpers/networks';
import { encodeEvmTransactionData } from './index';
import { createNablaTransactionsForQuote } from './nabla';
import { getOnChainTokenDetails, isEvmTokenDetails, isOnChainToken } from '../../../config/tokens';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import Big from 'big.js';

export async function prepareOfframpTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
): Promise<UnsignedTx[]> {
  const unsignedTxs: UnsignedTx[] = [];

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }
  const fromNetworkId = getNetworkId(fromNetwork);

  // validate input token. At this point should be validated by the quote endpoint,
  // but we need it for the type check
  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency)!;
  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0); // Raw amount on initial chain.

  // Create unsigned transactions for each ephemeral account
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (!isOnChainToken(quote.inputCurrency)) {
      throw new Error(`Input currency cannot be fiat token ${quote.inputCurrency} for offramp.`);
    }
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
    if (!inputTokenDetails) {
      throw new Error(`Token ${quote.inputCurrency} is not supported for offramp`);
    }

    // If the network defined for the account is the same as the network of the input token, we know it's the transaction
    // on the source network that needs to be signed by the user wallet and not an ephemeral.
    if (accountNetworkId === fromNetworkId) {
      if (isEvmTokenDetails(inputTokenDetails)) {
        const { approveData, swapData } = await createOfframpSquidrouterTransactions({
          inputTokenDetails,
          fromNetwork: account.network,
          rawAmount: inputAmountRaw,
          // Source and destination are both the user itself
          addressDestination: account.address,
          fromAddress: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(approveData),
          phase: 'squidRouter', // TODO assign correct phase
          network: account.network,
          nonce: 0,
          signer: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(swapData),
          phase: 'squidRouter', // TODO assign correct phase
          network: account.network,
          nonce: 0,
          signer: account.address,
        });
      } else {
        // TODO Prepare transaction for initial AssetHub transfer
      }
    }
    // If network is Moonbeam, we need to create a second transaction to send the funds to the user
    else if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // TODO implement creation of unsigned ephemeral tx for Moonbeam -> Pendulum
    }
    // If network is Pendulum, create all the swap transactions
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { approveTransaction, swapTransaction } = await createNablaTransactionsForQuote(quote, account);

      unsignedTxs.push({
        tx_data: approveTransaction,
        phase: 'approve', // TODO assign correct phase
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: swapTransaction,
        phase: 'swap', // TODO assign correct phase
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      if (quote.outputCurrency === 'BRL') {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> Moonbeam
      } else {
        // TODO implement creation of unsigned ephemeral tx for Spacewalk, and Stellar transfers + cleanup
      }
    }
  }

  return unsignedTxs;
}
