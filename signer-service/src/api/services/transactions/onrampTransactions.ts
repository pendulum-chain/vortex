import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { getNetworkFromDestination, getNetworkId, Networks } from '../../helpers/networks';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { encodeEvmTransactionData, encodeSubmittableExtrinsic } from './index';
import { createOnrampSquidrouterTransactions } from './squidrouter/onramp';
import {
  getAnyFiatTokenDetails,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
} from '../../../config/tokens';
import { createMoonbeamToPendulumXCM } from './xcm/moonbeamToPendulum';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import Big from 'big.js';
import { createPendulumToAssethubTransfer } from './xcm/pendulumToAssethub';
import { createNablaTransactionsForQuote } from './nabla';

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
): Promise<UnsignedTx[]> {
  const unsignedTxs: UnsignedTx[] = [];

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }
  const toNetworkId = getNetworkId(toNetwork);

  // ensure we have Pendulum, Moonbeam ephemerals
  const pendulumEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error('Pendulum ephemeral not found');
  }

  const moonbeamEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Moonbeam);
  if (!moonbeamEphemeralEntry) {
    throw new Error('Moonbeam ephemeral not found');
  }

  // validate input token. At this point should be validated by the quote endpoint,
  // but we need it for the type check
  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);

  if (!isMoonbeamTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be Moonbeam token for onramp, got ${quote.inputCurrency}`);
  }

  const outputTokenDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toString();
  const outputAmountRaw = multiplyByPowerOfTen(
    new Big(quote.outputAmount).add(new Big(quote.fee)),
    outputTokenDetails.pendulumDecimals,
  ).toString(); //Nabla output. TODO I would prefer to store the w/o fee amount on the quote entry

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    const rawAmount = quote.inputAmount; // TODO convert to raw amount

    if (!isOnChainToken(quote.outputCurrency)) {
      throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
    }
    const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
    if (!outputTokenDetails) {
      throw new Error(`Token ${quote.outputCurrency} is not supported for offramp`);
    }

    // TODO implement creation of unsigned ephemeral txs for swaps

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      if (!isEvmTokenDetails(outputTokenDetails)) {
        console.log('Output token is not an EVM token, skipping onramp transaction creation for Moonbeam ephemeral');
        continue;
      }
      const moonbeamEphemeralStartingNonce = 0;
      const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
        pendulumEphemeralEntry.address,
        inputAmountRaw,
        inputTokenDetails.moonbeamErc20Address,
      );
      unsignedTxs.push({
        tx_data: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
        phase: 'moonbeamToPendulumXCM',
        network: account.network,
        nonce: moonbeamEphemeralStartingNonce,
        signer: account.address,
      });

      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        const { approveData, swapData } = await createOnrampSquidrouterTransactions({
          outputTokenDetails,
          toNetwork,
          rawAmount,
          addressDestination: account.address,
          fromAddress: account.address,
          moonbeamEphemeralStartingNonce: moonbeamEphemeralStartingNonce + 1,
        });

        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(approveData),
          phase: 'moonbeamSquidrouter',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 1,
          signer: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(swapData),
          phase: 'moonbeamSquidrouter',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { approveTransaction, swapTransaction } = await createNablaTransactionsForQuote(quote, account);

      unsignedTxs.push({
        tx_data: approveTransaction,
        phase: 'nablaApprove',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: swapTransaction,
        phase: 'nablaSwap',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
          moonbeamEphemeralEntry.address,
          outputAmountRaw,
          outputTokenDetails.pendulumCurrencyId,
        );
        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
          phase: 'pendulumToMoonbeamXcm',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      } else {
        const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
          destinationAddress,
          outputTokenDetails.pendulumCurrencyId,
          outputAmountRaw,
        );
        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction),
          phase: 'pendulumToAssethubXcm',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }
    }
  }

  return unsignedTxs;
}
