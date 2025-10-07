import { getNetworkId, getPendulumDetails, Networks, UnsignedTx } from "@packages/shared";
import { StateMetadata } from "../../../phases/meta-state-types";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnramp } from "../common/validation";
import { createAssetHubFinalizationTransactions } from "../flows/finalization";
import { createBRLAInitialTransactions } from "../flows/initial-steps";
import { createPendulumSwapAndSubsidizeTransactions } from "../flows/pendulum";

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareAveniaToAssethubOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  taxId
}: AveniaOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, inputTokenDetails } =
    validateAveniaOnramp(quote, signingAccounts);
  const toNetworkId = getNetworkId(toNetwork);

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  stateMeta = {
    destinationAddress,
    inputTokenPendulumDetails,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    outputTokenPendulumDetails,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    taxId
  };

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      await createBRLAInitialTransactions(
        quote,
        unsignedTxs,
        pendulumEphemeralEntry.address,
        inputTokenDetails,
        moonbeamEphemeralEntry,
        toNetworkId
      );
    }

    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { nablaStateMeta, pendulumNonce } = await createPendulumSwapAndSubsidizeTransactions(
        quote,
        pendulumEphemeralEntry,
        outputTokenDetails,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        unsignedTxs
      );
      stateMeta = { ...stateMeta, ...nablaStateMeta };

      await createAssetHubFinalizationTransactions(
        quote,
        pendulumEphemeralEntry,
        outputTokenDetails,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        destinationAddress,
        unsignedTxs,
        pendulumNonce
      );
    }
  }

  return { stateMeta, unsignedTxs };
}
