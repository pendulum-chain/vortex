import {
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsFromMoonbeamToEvm,
  createPendulumToMoonbeamTransfer,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  getNetworkId,
  getPendulumDetails,
  isEvmTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import {
  addFeeDistributionTransaction,
  addMoonbeamTransactions,
  addNablaSwapTransactions,
  addPendulumCleanupTx
} from "../common/transactions";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnramp } from "../common/validation";

/**
 * Prepares all transactions for an Avenia (BRL) onramp to EVM chain.
 * This route handles: BRL → Moonbeam (BRLA) → Pendulum (swap) → Moonbeam → EVM (final transfer)
 */
export async function prepareAveniaToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  taxId
}: AveniaOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, inputTokenDetails } =
    validateAveniaOnramp(quote, signingAccounts);
  const toNetworkId = getNetworkId(toNetwork);

  // Get token details
  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    taxId
  };

  let moonbeamNonce = 0;

  // Build transactions for each network
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    // Moonbeam: Initial BRLA transfer to Pendulum
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      if (!quote.metadata.aveniaMint?.amountOutRaw) {
        throw new Error("Missing aveniaMint amountOutRaw in quote metadata");
      }
      const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaMint.amountOutRaw;

      moonbeamNonce = await addMoonbeamTransactions(
        {
          account: moonbeamEphemeralEntry,
          inputAmountPostAnchorFeeRaw,
          inputTokenDetails,
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          toNetworkId
        },
        unsignedTxs,
        moonbeamNonce
      );
    }

    // Pendulum: Nabla swap and transfer to Moonbeam
    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      let pendulumNonce = 0;

      // Add Nabla swap transactions
      const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactions(
        {
          account: pendulumEphemeralEntry,
          inputTokenPendulumDetails,
          outputTokenPendulumDetails,
          quote
        },
        unsignedTxs,
        pendulumNonce
      );
      stateMeta = { ...stateMeta, ...nablaStateMeta };
      pendulumNonce = nonceAfterNabla;

      // Add fee distribution
      pendulumNonce = await addFeeDistributionTransaction(quote, pendulumEphemeralEntry, unsignedTxs, pendulumNonce);

      // Transfer from Pendulum to Moonbeam
      const pendulumCleanupTx = await addPendulumCleanupTx({
        account: pendulumEphemeralEntry,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails
      });

      if (!quote.metadata.moonbeamToEvm?.outputAmountRaw) {
        throw new Error("Missing bridge output amount for Moonbeam");
      }

      const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
        moonbeamEphemeralEntry.address,
        quote.metadata.moonbeamToEvm.outputAmountRaw,
        outputTokenDetails.pendulumRepresentative.currencyId
      );

      unsignedTxs.push({
        meta: {},
        network: pendulumEphemeralEntry.network,
        nonce: pendulumNonce,
        phase: "pendulumToMoonbeamXcm",
        signer: pendulumEphemeralEntry.address,
        txData: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction)
      });
      pendulumNonce++;

      unsignedTxs.push({
        ...pendulumCleanupTx,
        nonce: pendulumNonce
      });
      pendulumNonce++;

      // Moonbeam: Squidrouter swap to target EVM token
      if (!isEvmTokenDetails(outputTokenDetails)) {
        throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
      }

      const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromMoonbeamToEvm({
        destinationAddress,
        fromAddress: moonbeamEphemeralEntry.address,
        fromToken: AXL_USDC_MOONBEAM_DETAILS.erc20AddressSourceChain,
        moonbeamEphemeralStartingNonce: moonbeamNonce,
        rawAmount: quote.metadata.moonbeamToEvm.outputAmountRaw,
        toNetwork: outputTokenDetails.network,
        toToken: outputTokenDetails.erc20AddressSourceChain
      });

      unsignedTxs.push({
        meta: {},
        network: moonbeamEphemeralEntry.network,
        nonce: moonbeamNonce,
        phase: "squidRouterApprove",
        signer: moonbeamEphemeralEntry.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      });
      moonbeamNonce++;

      unsignedTxs.push({
        meta: {},
        network: moonbeamEphemeralEntry.network,
        nonce: moonbeamNonce,
        phase: "squidRouterSwap",
        signer: moonbeamEphemeralEntry.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      });
      moonbeamNonce++;
    }
  }

  return { stateMeta, unsignedTxs };
}
