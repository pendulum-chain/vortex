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
    new Big(quote.outputAmount + quote.fee),
    outputTokenDetails.pendulumDecimals,
  ).toString(); //TODO I would prefer to store the w/o fee amount on the quote entry

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
          phase: 'moonbeam', // TODO assign correct phase
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 1,
          signer: account.address,
        });
        unsignedTxs.push({
          tx_data: encodeEvmTransactionData(swapData),
          phase: 'moonbeam', // TODO assign correct phase
          network: account.network,
          nonce: moonbeamEphemeralStartingNonce + 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
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

//   const { ss58Format } = pendulumNode;
//   const keyring = new Keyring({ type: 'sr25519', ss58Format });
//   const pendulumEphemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
//   const pendulumEphemeralPublicKey = pendulumEphemeralKeypair.address;
//
//   const dataCommon = {
//     flowType,
//     timestamp: new Date().toISOString(),
//     pendulumEphemeralPublicKey,
//     inputAmount: inputAmount.raw.toString(),
//     inputTokenType,
//     outputAmount: outputAmount.raw.toString(),
//     outputTokenType,
//   };
//
//   try {
//     transactions = await prepareBrlaOnrampTransactions(state, context);
//
//     const data = {
//       ...dataCommon,
//       nablaApprovalTx: transactions.nablaApproveTransaction,
//       nablaSwapTx: transactions.nablaSwapTransaction,
//       moonbeamToPendulumXcmTx: transactions.moonbeamToPendulumXcmTransaction,
//       pendulumToMoonbeamXcmTx: transactions.pendulumToMoonbeamXcmTransaction,
//       squidrouterApproveTx: transactions.squidrouterApproveTransaction,
//       squidrouterSwapTx: transactions.squidrouterSwapTransaction,
//       pendulumToAssetHubXcmTx: transactions.pendulumToAssetHubXcmTransaction,
//     };
//   } catch (err) {
//     const error = err as Error;
//     console.log(error);
//     return { ...state, failure: { type: 'unrecoverable', message: error.message } };
//   }
//
//   return unsignedTxs
// }
//
// async function prepareBrlaOnrampTransactions(
//   state: OnrampingState,
//   context: ExecutionContext,
// ): Promise<BrlaOnrampTransactions> {
//   const {
//     moonbeamEphemeralSeed,
//     moonbeamEphemeralAddress,
//     pendulumEphemeralSeed,
//     pendulumEphemeralAddress,
//     addressDestination,
//     inputAmount,
//     outputAmount,
//     inputTokenType,
//     outputTokenType,
//     nablaSwapNonce,
//     toNetwork,
//   } = state;
//
//   const { moonbeamNode, pendulumNode } = context;
//
//   const inputTokenAddressMoonbeam = getAnyFiatTokenDetailsMoonbeam(inputTokenType)?.moonbeamErc20Address;
//   const outputTokenDetails = getOnChainTokenDetails(toNetwork, outputTokenType)!;
//
//   // Improvement: Nabla could be moved to a transaction commons, also with offramp.
//   const nablaApproveTransaction = await prepareNablaApproveTransaction(state, context);
//   const nablaSwapTransaction = await prepareNablaSwapTransaction(state, context);
//   console.log('Nabla transactions prepared');
//
//   const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
//     moonbeamNode.api,
//     pendulumEphemeralAddress,
//     inputAmount.raw.toString(),
//     inputTokenAddressMoonbeam,
//     moonbeamEphemeralSeed,
//   );
//   console.log('destination address: ', addressDestination);
//   console.log(
//     'Moonbeam to Pendulum XCM transaction prepared: ',
//     encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
//   );
//   // Second and third transactions of moonbeam's fresh account are Squidrouter transactions
//
//   // Will be it's second transaction, after Moonbeam to Pendulum XCM
//   const moonbeamEphemeralStartingNonce = 1;
//   const { squidrouterApproveTransaction, squidrouterSwapTransaction } = await createOnrampSquidrouterTransaction({
//     fromAddress: moonbeamEphemeralAddress,
//     amount: outputAmount.raw.toString(),
//     outputToken: outputTokenType,
//     toNetwork: toNetwork,
//     addressDestination,
//     moonbeamEphemeralSeed: moonbeamEphemeralSeed as `0x${string}`,
//     moonbeamEphemeralStartingNonce,
//   });
//   console.log('Squid transactions prepared: ', squidrouterApproveTransaction, squidrouterSwapTransaction);
//   const pendulumToMoonbeamNonce = nablaSwapNonce + 1;
//
//   const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
//     pendulumNode,
//     moonbeamEphemeralAddress,
//     outputAmount.raw,
//     state.pendulumEphemeralSeed,
//     outputTokenDetails.pendulumCurrencyId,
//     pendulumToMoonbeamNonce,
//   );
//   console.log('Pendulum to Moonbeam XCM transaction prepared: ', pendulumToMoonbeamXcmTransaction);
//   const pendulumToAssethubNonce = nablaSwapNonce + 1;
//
//   const pendulumToAssetHubXcmTransaction = await createPendulumToAssethubTransfer(
//     pendulumNode,
//     addressDestination,
//     outputTokenDetails.pendulumCurrencyId,
//     outputAmount.raw,
//     pendulumEphemeralSeed,
//     pendulumToAssethubNonce + 1,
//   );
//   console.log('Pendulum to Assethub XCM transaction prepared: ', pendulumToAssetHubXcmTransaction);
//   const transactions = {
//     nablaApproveTransaction: encodeSubmittableExtrinsic(nablaApproveTransaction),
//     nablaSwapTransaction: encodeSubmittableExtrinsic(nablaSwapTransaction),
//     moonbeamToPendulumXcmTransaction: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
//     pendulumToMoonbeamXcmTransaction: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
//     squidrouterApproveTransaction,
//     squidrouterSwapTransaction,
//     pendulumToAssetHubXcmTransaction: encodeSubmittableExtrinsic(pendulumToAssetHubXcmTransaction),
//   };
//
//   return transactions;
// }
