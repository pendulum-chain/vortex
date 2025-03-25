import QuoteTicket, { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { createOfframpSquidrouterTransactions } from './squidrouter/offramp';
import { getNetworkFromDestination, getNetworkId, Networks } from '../../helpers/networks';
import { encodeEvmTransactionData } from './index';

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

  // Create unsigned transactions for each ephemeral account
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    // If the account is the same network as the quote, we can assume it's the initial transaction and thus squidrouter
    if (accountNetworkId === fromNetworkId) {
      const { approveData, swapData } = await createOfframpSquidrouterTransactions({
        inputToken: quote.inputCurrency,
        fromNetwork: account.network,
        amount: quote.inputAmount,
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
    }
    // If network is Moonbeam, we need to create a second transaction to send the funds to the user
    else if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // TODO implement creation of unsigned ephemeral tx for Moonbeam -> Pendulum
    }
    // If network is Pendulum, create all the swap transactions
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // TODO implement creation of unsigned ephemeral txs for swaps
      if (quote.outputCurrency === 'BRL') {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> Moonbeam
      } else {
        // TODO implement creation of unsigned ephemeral tx for Spacewalk, and Stellar transfers + cleanup
      }
    }
  }

  return unsignedTxs;
}
