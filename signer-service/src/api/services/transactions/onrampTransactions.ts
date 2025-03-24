import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { getNetworkId, Networks } from '../../helpers/networks';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { encodeEvmTransactionData } from './index';
import { createOnrampSquidrouterTransactions } from './squidrouter/onramp';

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
): Promise<UnsignedTx[]> {
  const unsignedTxs: UnsignedTx[] = [];

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      const { approveData, swapData } = await createOnrampSquidrouterTransactions({
        inputToken: quote.inputCurrency,
        fromNetwork: account.network,
        amount: quote.inputAmount,
        addressDestination: account.address,
        fromAddress: account.address,
      });

      unsignedTxs.push({
        tx_data: encodeEvmTransactionData(approveData),
        phase: 'moonbeam', // TODO assign correct phase
        network: account.network,
        nonce: 0,
        signer: account.address,
      });
      unsignedTxs.push({
        tx_data: encodeEvmTransactionData(swapData),
        phase: 'moonbeam', // TODO assign correct phase
        network: account.network,
        nonce: 0,
        signer: account.address,
      });
    } else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // TODO implement creation of unsigned ephemeral txs for swaps

      if (quote.chainId === getNetworkId(Networks.AssetHub)) {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> AssetHub
      } else {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> Moonbeam
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
