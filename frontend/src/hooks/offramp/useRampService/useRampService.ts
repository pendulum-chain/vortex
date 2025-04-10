// import { useSubmitOfframp } from '../../useSubmitOfframp';
// import { useOfframpEvents } from '../../useOfframpEvents';
// import { useRampExecutionInput, useRampStore } from '../../../../stores/offrampStore';
// import { useSep24Actions, useSep24InitialResponse, useSep24UrlInterval } from '../../../../stores/sep24Store';
// import { useAnchorWindowHandler } from '../../useSEP24/useAnchorWindowHandler';
// import { useVortexAccount } from '../../../useVortexAccount';
// import { RampService } from '../../../../services/api';
// import { AccountMeta, getAddressForFormat, Networks, signUnsignedTransactions } from 'shared';
// import {
//   signAndSubmitEvmTransaction,
//   signAndSubmitSubstrateTransaction,
// } from '../../../../services/transactions/userSigning';
// import { useAssetHubNode, usePendulumNode } from '../../../../contexts/polkadotNode';
// import { useEffect, useState } from 'react';
// import { usePolkadotWalletState } from '../../../../contexts/polkadotWallet';

// export const useRegisterRamp = () => {
//   const {
//     rampRegistered,
//     rampState,
//     rampStarted,
//     actions: { resetRampState, setRampStarted, setRampRegistered, setRampState, setRampSigningPhase },
//   } = useRampStore();

//   const executionInput = useRampExecutionInput();
//   const { address, chainId } = useVortexAccount();
//   const { apiComponents: pendulumApiComponents } = usePendulumNode();
//   const { apiComponents: assethubApiComponents } = useAssetHubNode();
//   const { walletAccount: substrateWalletAccount } = usePolkadotWalletState();

//   // TODO if user declined signing, do something
//   const [userDeclinedSigning, setUserDeclinedSigning] = useState(false);
//   const [userSigningInProgress, setUserSigningInProgress] = useState(false);

//   // Sep 24 states
//   const firstSep24Response = useSep24InitialResponse();
//   const firstSep24Interval = useSep24UrlInterval();

//   const { cleanup: cleanupSep24 } = useSep24Actions();

//   const events = useOfframpEvents();
//   const handleOnAnchorWindowOpen = useAnchorWindowHandler();

//   const handleBrlaOfframpStart = async () => {
//     if (!executionInput) {
//       throw new Error('Missing execution input');
//     }

//     if (!executionInput.taxId || !executionInput.pixId || !executionInput.brlaEvmAddress) {
//       throw new Error('Missing values on execution input');
//     }

//     if (!chainId) {
//       throw new Error('Missing chainId');
//     }

//     if (!pendulumApiComponents?.api) {
//       throw new Error('Missing pendulumApiComponents');
//     }

//     const quoteId = executionInput.quote.id;
//     const signingAccounts: AccountMeta[] = [
//       { address: executionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
//       { address: executionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
//     ];
//     const additionalData = {
//       walletAddress: executionInput.userWalletAddress,
//       pixDestination: executionInput.pixId,
//       taxId: executionInput.taxId,
//       receiverTaxId: executionInput.taxId,
//       brlaEvmAddress: executionInput.brlaEvmAddress,
//     };
//     const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);

//     const signedTxs = await signUnsignedTransactions(
//       rampProcess.unsignedTxs,
//       executionInput.ephemerals,
//       pendulumApiComponents.api,
//     );

//     setRampRegistered(true);
//     setRampState({
//       quote: executionInput.quote,
//       ramp: rampProcess,
//       signedTransactions: [],
//       requiredUserActionsCompleted: false,
//       userSigningMeta: {
//         squidRouterApproveHash: undefined,
//         squidRouterSwapHash: undefined,
//         assetHubToPendulumHash: undefined,
//       },
//     });
//   };

//   useEffect(() => {
//     if (rampRegistered && rampStarted) {
//       return;
//     }
//     if (!rampState?.ramp || !pendulumApiComponents?.api || !executionInput || !chainId) {
//       return;
//     }

//     // Check if we need to sign the transactions
//     if (rampState.signedTransactions.length === 0) {
//       const ephemeralTxs = rampState.ramp.unsignedTxs.filter((tx) => {
//         if (!address) {
//           return true;
//         }

//         return chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
//           ? getAddressForFormat(tx.signer, 0) !== getAddressForFormat(address, 0)
//           : tx.signer.toLowerCase() !== address.toLowerCase();
//       });

//       // Sign all unsigned transactions with ephemerals
//       signUnsignedTransactions(ephemeralTxs, executionInput.ephemerals, pendulumApiComponents.api).then(
//         (signedTransactions) => {
//           setRampState({
//             ...rampState,
//             signedTransactions,
//           });
//         },
//       );
//     }
//   }, [
//     address,
//     chainId,
//     executionInput,
//     pendulumApiComponents?.api,
//     rampRegistered,
//     rampStarted,
//     rampState,
//     setRampState,
//   ]);

//   useEffect(() => {
//     // Determine if conditions are met before filtering transactions
//     const requiredMetaIsEmpty =
//       !rampState?.userSigningMeta?.squidRouterApproveHash &&
//       !rampState?.userSigningMeta?.squidRouterSwapHash &&
//       !rampState?.userSigningMeta?.assetHubToPendulumHash;

//     const shouldRequestSignatures =
//       rampState?.ramp && // Ramp process data exists
//       !rampStarted && // Ramp hasn't been started yet
//       requiredMetaIsEmpty && // User signing metadata hasn't been populated yet
//       chainId !== undefined; // Chain ID is available

//     if (!shouldRequestSignatures || userSigningInProgress || userDeclinedSigning) {
//       return; // Exit early if conditions aren't met
//     }
//     setUserSigningInProgress(true);

//     // Now filter the transactions after passing the main guard
//     const userTxs = rampState?.ramp?.unsignedTxs.filter((tx) => {
//       if (!address) {
//         return false;
//       }

//       return chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
//         ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
//         : tx.signer.toLowerCase() === address.toLowerCase();
//     });

//     // Add a check to ensure there are actually transactions for the user to sign
//     if (userTxs?.length === 0) {
//       console.log('No user transactions found requiring signature.');
//       return;
//     }

//     console.log('Proceeding to request signatures from user...');

//     // Kick off user signing process
//     const requestSignaturesFromUser = async () => {
//       let squidRouterApproveHash: string | undefined = undefined;
//       let squidRouterSwapHash: string | undefined = undefined;
//       let assetHubToPendulumHash: string | undefined = undefined;

//       // Sign user transactions by nonce
//       const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

//       for (const tx of sortedTxs!) {
//         if (tx.phase === 'squidrouterApprove') {
//           setRampSigningPhase('started');
//           squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
//           setRampSigningPhase('signed');
//         } else if (tx.phase === 'squidrouterSwap') {
//           squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
//           setRampSigningPhase('finished');
//         } else if (tx.phase === 'assethubToPendulum') {
//           if (!substrateWalletAccount) {
//             throw new Error('Missing substrateWalletAccount, user needs to be connected to a wallet account. ');
//           }
//           if (!assethubApiComponents?.api) {
//             throw new Error('Missing assethubApiComponents. Assethub API is not available.');
//           }
//           setRampSigningPhase('started');
//           assetHubToPendulumHash = await signAndSubmitSubstrateTransaction(
//             tx,
//             assethubApiComponents.api,
//             substrateWalletAccount,
//           );
//           setRampSigningPhase('finished');
//         } else {
//           throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
//         }
//       }

//       // TODO change this to a React-dispatch/setState like approach in order not to lose the state?
//       setRampState({
//         ...rampState,
//         userSigningMeta: {
//           squidRouterApproveHash,
//           squidRouterSwapHash,
//           assetHubToPendulumHash,
//         },
//       });
//     };

//     requestSignaturesFromUser()
//       .then(() => {
//         console.log('Done requesting signatures from user');
//       })
//       .catch((error) => {
//         console.error('Error requesting signatures from user', error);
//         // TODO check if user declined based on error provided
//         // For now, assume it failed because the user declined
//         setUserDeclinedSigning(true);
//       })
//       .finally(() => setUserSigningInProgress(false));
//   }, [
//     address,
//     assethubApiComponents?.api,
//     chainId,
//     rampStarted,
//     rampState,
//     setRampSigningPhase,
//     setRampState,
//     substrateWalletAccount,
//     userDeclinedSigning,
//     userSigningInProgress,
//   ]);

//   useEffect(() => {
//     // Check if all prerequisites are met to start the ramp
//     // Check if any of the relevant signing metadata fields are populated
//     const requiredMetaPopulated =
//       Boolean(rampState?.userSigningMeta?.squidRouterApproveHash) ||
//       Boolean(rampState?.userSigningMeta?.squidRouterSwapHash) ||
//       Boolean(rampState?.userSigningMeta?.assetHubToPendulumHash);

//     const shouldStartRamp =
//       requiredMetaPopulated && // User signing is complete (metadata exists)
//       !rampStarted && // Ramp hasn't been started yet
//       Boolean(rampState?.ramp) && // Ramp data exists
//       Boolean((rampState?.signedTransactions?.length || 0) > 0); // Ephemeral txs are signed

//     if (!shouldStartRamp) {
//       return;
//     }

//     console.log('Proceeding to start the ramp...');

//     // Call into the `startRamp` endpoint
//     RampService.startRamp(rampState!.ramp!.id, rampState!.signedTransactions, rampState!.userSigningMeta)
//       .then((response) => {
//         console.log('startRampResponse', response);
//         setRampStarted(true);
//       })
//       .catch((err) => {
//         console.error('Error starting ramp:', err);
//       });
//   }, [rampStarted, rampState, setRampStarted]);

//   return {
//     handleOnSubmit: useSubmitOfframp(),
//     firstSep24ResponseState: firstSep24Response,
//     finishOfframping: () => {
//       events.resetUniqueEvents();
//       resetRampState();
//       cleanupSep24();
//     },
//     continueFailedFlow: () => {
//       // FIXME call into backend to retry the offramp
//       // updateOfframpHookStateFromState(recoverFromFailure(offrampState));
//     },
//     handleOnAnchorWindowOpen: handleOnAnchorWindowOpen,
//     handleBrlaOfframpStart: handleBrlaOfframpStart,
//     maybeCancelSep24First: () => {
//       if (firstSep24Interval !== undefined) {
//         setRampStarted(false);
//         cleanupSep24();
//       }
//     },
//   };
// };
