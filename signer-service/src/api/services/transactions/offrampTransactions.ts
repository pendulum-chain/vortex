import QuoteTicket, { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are stored in the state and the phase is updated to 'squidRouter'.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOfframpTransactions(
  quote: QuoteTicketAttributes,
  ephemerals: AccountMeta[],
): Promise<UnsignedTx[]> {
  const unsignedTx: UnsignedTx[] = [];
  return unsignedTx;
}

//   let transactions: BrlaOfframpTransactions | SpacewalkOfframpTransactions | undefined = undefined;
//   let stellarEphemeralPublicKey: string | undefined = undefined;
//
//   const { ss58Format } = pendulumNode;
//   const keyring = new Keyring({ type: 'sr25519', ss58Format });
//   const pendulumEphemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
//   const pendulumEphemeralPublicKey = pendulumEphemeralKeypair.address;
//
//   const dataCommon = {
//     flowType,
//     timestamp: new Date().toISOString(),
//     offramperAddress: state.offramperAddress,
//     pendulumEphemeralPublicKey,
//     inputAmount: inputAmount.raw.toString(),
//     inputTokenType,
//     outputAmount: outputAmount.raw.toString(),
//     outputTokenType,
//     squidRouterReceiverId,
//     squidRouterReceiverHash,
//   };
//
//   try {
//     if (outputTokenType !== FiatToken.BRL) {
//       ({ transactions, stellarEphemeralPublicKey } = await prepareSpacewalkOfframpTransactions(state, context));
//       const data = {
//         ...dataCommon,
//         nablaApprovalTx: transactions.nablaApproveTransaction,
//         nablaSwapTx: transactions.nablaSwapTransaction,
//         spacewalkRedeemTx: transactions.spacewalkRedeemTransaction,
//         stellarOfframpTx: transactions.stellarOfframpingTransaction,
//         stellarCleanupTx: transactions.stellarCleanupTransaction,
//         stellarEphemeralPublicKey,
//       };
//       await storeDataInBackend(data);
//     } else {
//       transactions = await prepareBrlaOfframpTransactions(state, context);
//       const data = {
//         ...dataCommon,
//         nablaApprovalTx: transactions.nablaApproveTransaction,
//         nablaSwapTx: transactions.nablaSwapTransaction,
//         pendulumToMoonbeamXcmTx: transactions.pendulumToMoonbeamXcmTransaction,
//       };
//       await storeDataInBackend(data);
//     }
//   } catch (err) {
//     const error = err as Error;
//     console.log(error);
//     return { ...state, failure: { type: 'unrecoverable', message: error.message } };
//   }
//
//   return {
//     ...state,
//     transactions,
//     phase: getNextPhase(state.network),
//   };
// }
//
// async function prepareCommonTransactions(state: OfframpingState, context: ExecutionContext) {
//   const nablaApproveTransaction = await prepareNablaApproveTransaction(state, context);
//   const nablaSwapTransaction = await prepareNablaSwapTransaction(state, context);
//
//   return {
//     nablaApproveTransaction,
//     nablaSwapTransaction,
//   };
// }
//
// async function prepareSpacewalkOfframpTransactions(
//   state: OfframpingState,
//   context: ExecutionContext,
// ): Promise<{ transactions: SpacewalkOfframpTransactions; stellarEphemeralPublicKey: string }> {
//   const { nablaApproveTransaction, nablaSwapTransaction } = await prepareCommonTransactions(state, context);
//
//   const { stellarEphemeralSecret, outputTokenType, sepResult } = state;
//
//   if (!stellarEphemeralSecret || !sepResult) {
//     throw new Error('Missing variables on initial state. This is a bug.');
//   }
//   const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction(state, context);
//
//   // Fund Stellar ephemeral only after all other transactions are prepared
//   await stellarCreateEphemeral(stellarEphemeralSecret, outputTokenType);
//   const stellarFundingAccountId = (await fetchSigningServiceAccountId()).stellar.public;
//   const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
//   const stellarEphemeralPublicKey = stellarEphemeralKeypair.publicKey();
//
//   const { offrampingTransaction, mergeAccountTransaction } = await setUpAccountAndOperations(
//     stellarFundingAccountId,
//     stellarEphemeralKeypair,
//     sepResult,
//     outputTokenType,
//   );
//
//   const transactions = {
//     stellarOfframpingTransaction: offrampingTransaction.toEnvelope().toXDR().toString('base64'),
//     stellarCleanupTransaction: mergeAccountTransaction.toEnvelope().toXDR().toString('base64'),
//     spacewalkRedeemTransaction: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
//     nablaSwapTransaction: encodeSubmittableExtrinsic(nablaSwapTransaction),
//     nablaApproveTransaction: encodeSubmittableExtrinsic(nablaApproveTransaction),
//   };
//
//   return { transactions, stellarEphemeralPublicKey };
// }
//
// async function prepareBrlaOfframpTransactions(
//   state: OfframpingState,
//   context: ExecutionContext,
// ): Promise<BrlaOfframpTransactions> {
//   const { nablaApproveTransaction, nablaSwapTransaction } = await prepareCommonTransactions(state, context);
//
//   const { brlaEvmAddress, outputAmount, nablaSwapNonce } = state;
//   const { pendulumNode } = context;
//
//   if (!brlaEvmAddress) {
//     throw new Error('Missing variables on initial state. This is a bug.');
//   }
//
//   const pendulumToMoonbeamNonce = nablaSwapNonce + 1;
//   const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
//     pendulumNode,
//     brlaEvmAddress,
//     outputAmount.raw,
//     state.pendulumEphemeralSeed,
//     getAnyFiatTokenDetailsMoonbeam(state.outputTokenType).pendulumCurrencyId,
//     pendulumToMoonbeamNonce,
//   );
//
//   const transactions = {
//     pendulumToMoonbeamXcmTransaction: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
//     nablaSwapTransaction: encodeSubmittableExtrinsic(nablaSwapTransaction),
//     nablaApproveTransaction: encodeSubmittableExtrinsic(nablaApproveTransaction),
//   };
//
//   return transactions;
// }
