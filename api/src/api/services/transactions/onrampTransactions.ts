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
  AccountMeta,
  encodeSubmittableExtrinsic,
} from 'shared';
import Big from 'big.js';
import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { encodeEvmTransactionData } from './index';
import { createOnrampSquidrouterTransactions } from './squidrouter/onramp';
import { createMoonbeamToPendulumXCM } from './xcm/moonbeamToPendulum';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { createPendulumToAssethubTransfer } from './xcm/pendulumToAssethub';
import { createNablaTransactionsForOnramp, createNablaTransactionsForQuote } from './nabla';
import { preparePendulumCleanupTransaction } from './pendulum/cleanup';
import { prepareMoonbeamCleanupTransaction } from './moonbeam/cleanup';
import { StateMetadata } from '../phases/meta-state-types';

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
  taxId: string,
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
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

  // For BRLA, fee is charged after minting, so we always work with the amount after anchor fees.
  const inputAmountUnits = new Big(quote.inputAmount).sub(new Big(quote.fee));
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountUnits, inputTokenDetails.decimals).toFixed(0, 0);

  const outputAmount = new Big(quote.outputAmount);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmount, outputTokenDetails.decimals).toFixed(0, 0);

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  // add common data to state metadata, for later use on the executors
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    outputAmountBeforeFees: { units: outputAmount.toFixed(), raw: outputAmountRaw },
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    destinationAddress,
    taxId,
    inputAmountUnits: inputAmountUnits.toFixed(),
  };

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
        phase: 'moonbeamToPendulumXcm',
        network: account.network,
        nonce: moonbeamEphemeralStartingNonce,
        signer: account.address,
      });

      // TODO this does not execute properly. Has no effect (?)
      const moonbeamCleanupTransaction = await prepareMoonbeamCleanupTransaction();
      unsignedTxs.push({
        tx_data: encodeSubmittableExtrinsic(moonbeamCleanupTransaction),
        phase: 'moonbeamCleanup',
        network: account.network,
        nonce: 4,
        signer: account.address,
      });

      if (toNetworkId !== getNetworkId(Networks.AssetHub)) {
        if (!isEvmTokenDetails(outputTokenDetails)) {
          throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${quote.outputCurrency}`);
        }
        const { approveData, swapData } = await createOnrampSquidrouterTransactions({
          outputTokenDetails,
          toNetwork,
          rawAmount: outputAmountRaw,
          addressDestination: destinationAddress,
          fromAddress: account.address,
          moonbeamEphemeralStartingNonce: moonbeamEphemeralStartingNonce + 2,
        });

        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(approveData) as any,
          phase: 'squidrouterApprove',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 2,
          signer: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(swapData) as any,
          phase: 'squidrouterSwap',
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 3,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // We need to be carefull with pendulum decimals.
      const inputAmountBeforeSwapRaw = multiplyByPowerOfTen(
        inputAmountUnits,
        inputTokenPendulumDetails.pendulumDecimals,
      ).toFixed(0, 0);

      const nablaSoftMinimumOutput = outputAmount.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
      const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
        nablaSoftMinimumOutput,
        outputTokenDetails.pendulumDecimals,
      ).toFixed();
      console.log('fixed? soft minimum output raw....', nablaSoftMinimumOutputRaw);
      const { approveTransaction, swapTransaction } = await createNablaTransactionsForOnramp(
        inputAmountUnits,
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
        nonce: 1,
        signer: account.address,
      });

      stateMeta = {
        ...stateMeta,
        nablaSoftMinimumOutputRaw,
        inputAmountBeforeSwapRaw,
      };

      const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
        inputTokenPendulumDetails.pendulumCurrencyId,
        outputTokenPendulumDetails.pendulumCurrencyId,
      );

      unsignedTxs.push({
        tx_data: encodeSubmittableExtrinsic(pendulumCleanupTransaction),
        phase: 'pendulumCleanup',
        network: account.network,
        nonce: 3, // Will always come after either pendulumToMoonbeam or pendulumToAssethub.
        signer: account.address,
      });

      if (toNetworkId === getNetworkId(Networks.AssetHub)) {
        const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
          destinationAddress,
          outputTokenDetails.pendulumCurrencyId,
          outputAmountRaw,
        );
        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction),
          phase: 'pendulumToAssethub',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      } else {
        if (!moonbeamEphemeralEntry) {
          throw new Error('prepareOnrampTransactions: Moonbeam ephemeral not found');
        }

        const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
          moonbeamEphemeralEntry.address,
          outputAmountRaw,
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
