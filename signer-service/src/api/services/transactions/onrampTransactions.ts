import {
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
  Networks,
  UnsignedTx,
} from 'shared';
import Big from 'big.js';
import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { AccountMeta } from '../ramp/ramp.service';
import { encodeEvmTransactionData, encodeSubmittableExtrinsic } from './index';
import { createOnrampSquidrouterTransactions } from './squidrouter/onramp';
import { createMoonbeamToPendulumXCM } from './xcm/moonbeamToPendulum';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { createPendulumToAssethubTransfer } from './xcm/pendulumToAssethub';
import { createNablaTransactionsForQuote } from './nabla';

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta = {};
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
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency)!;

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  const outputAmountBeforeFees = new Big(quote.outputAmount).add(new Big(quote.fee));

  const outputAmountBeforeFeesRaw = multiplyByPowerOfTen(outputAmountBeforeFees, outputTokenDetails.decimals).toFixed(
    0,
    0,
  );

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      const moonbeamEphemeralStartingNonce = 0;
      const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
        pendulumEphemeralEntry.address,
        inputAmountRaw,
        inputTokenDetails.moonbeamErc20Address,
      );
      unsignedTxs.push({
        tx_data: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
        phase: 'moonbeamToPendulum',
        network: account.network,
        nonce: moonbeamEphemeralStartingNonce,
        signer: account.address,
      });

      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        if (!isEvmTokenDetails(outputTokenDetails)) {
          throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${quote.outputCurrency}`);
        }
        const { approveData, swapData } = await createOnrampSquidrouterTransactions({
          outputTokenDetails,
          toNetwork,
          rawAmount: outputAmountBeforeFeesRaw,
          addressDestination: account.address,
          fromAddress: account.address,
          moonbeamEphemeralStartingNonce: moonbeamEphemeralStartingNonce + 1,
        });

        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(approveData),
          phase: 'squidrouterApprove',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 1,
          signer: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(swapData),
          phase: 'squidrouterSwap',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const nablaSoftMinimumOutput = outputAmountBeforeFees.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
      const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
        nablaSoftMinimumOutput,
        inputTokenPendulumDetails.pendulumDecimals,
      ).toFixed();

      const { approveTransaction, swapTransaction } = await createNablaTransactionsForQuote(
        quote,
        account,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
      );

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

      stateMeta = {
        ...stateMeta,
        pendulumEphemeralAddress: account.address,
        nablaSoftMinimumOutputRaw,
        pendulumAmountRaw: outputAmountBeforeFeesRaw,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
      };

      if (toNetworkId === getNetworkId(Networks.AssetHub)) {
        const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
          destinationAddress,
          outputTokenDetails.pendulumCurrencyId,
          outputAmountBeforeFeesRaw,
        );
        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction),
          phase: 'pendulumToAssethub',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      } else {
        const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
          moonbeamEphemeralEntry.address,
          outputAmountBeforeFeesRaw,
          outputTokenDetails.pendulumCurrencyId,
        );
        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
          phase: 'pendulumToMoonbeam',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }
    }
  }

  return { unsignedTxs, stateMeta };
}
