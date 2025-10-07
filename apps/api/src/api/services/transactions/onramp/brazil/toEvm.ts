import { getNetworkId, getPendulumDetails, Networks, UnsignedTx } from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnramp } from "../common/validation";
import { createBRLAToEvmFinalizationTransactions } from "../flows/finalization";
import { createBRLAInitialTransactions } from "../flows/initial-steps";
import { createPendulumSwapAndSubsidizeTransactions } from "../flows/pendulum";

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareAveniaToEvmOnrampTransactions({
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

  let moonbeamNonce = 0;
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      moonbeamNonce = await createBRLAInitialTransactions(
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

      await createBRLAToEvmFinalizationTransactions(
        quote,
        pendulumEphemeralEntry,
        moonbeamEphemeralEntry,
        outputTokenDetails,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        unsignedTxs,
        pendulumNonce,
        moonbeamNonce
      );
    }
  }

  return { stateMeta, unsignedTxs };
}
