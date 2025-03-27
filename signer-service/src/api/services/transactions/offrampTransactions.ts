import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { createOfframpSquidrouterTransactions } from './squidrouter/offramp';
import { getNetworkFromDestination, getNetworkId, Networks } from '../../helpers/networks';
import { encodeEvmTransactionData, encodeSubmittableExtrinsic } from './index';
import { createNablaTransactionsForQuote } from './nabla';
import {
  getAnyFiatTokenDetails,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
} from '../../../config/tokens';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import Big from 'big.js';
import { prepareSpacewalkRedeemTransaction } from './spacewalk/redeem';
import { buildPaymentAndMergeTx, PaymentData } from './stellar/offrampTransaction';

export async function prepareOfframpTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  stellarPaymentData?: PaymentData,
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

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);
  const outputAmountBeforeFees = new Big(quote.outputAmount).add(new Big(quote.fee));
  const outputAmountRaw = multiplyByPowerOfTen(outputAmountBeforeFees, outputTokenDetails.decimals).toFixed(0, 0);

  const stellarEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Stellar);
  if (!stellarEphemeralEntry) {
    throw new Error('Stellar ephemeral not found');
  }

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
        phase: 'approve',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: swapTransaction,
        phase: 'swap',
        network: account.network,
        nonce: 1,
        signer: account.address,
      });

      if (quote.outputCurrency === 'BRL') {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> Moonbeam
      } else {
        if (!isStellarOutputTokenDetails(outputTokenDetails)) {
          throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
        }
        const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction({
          outputAmountRaw,
          stellarTargetAccountRaw: Buffer.from(''), // TODO: get the target stellar ephemeral account
          outputTokenDetails,
          executeSpacewalkNonce: 0,
        });

        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
          phase: 'spacewalkRedeem',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Stellar)) {
      if (!isStellarOutputTokenDetails(outputTokenDetails)) {
        throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
      }
      if (!stellarPaymentData) {
        throw new Error('Stellar payment data must be provided for offramp');
      }

      const { paymentTransaction, mergeAccountTransaction, startingSequenceNumber } = await buildPaymentAndMergeTx(
        account.address,
        stellarPaymentData,
        outputTokenDetails,
      );

      unsignedTxs.push({
        tx_data: paymentTransaction,
        phase: 'stellarPayment',
        network: account.network,
        nonce: Number(startingSequenceNumber),
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: mergeAccountTransaction,
        phase: 'stellarCleanup',
        network: account.network,
        nonce: Number(startingSequenceNumber) + 1,
        signer: account.address,
      });
    }
  }

  return unsignedTxs;
}
