import {
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  getNetworkId,
  getPendulumDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { OnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";
import { createAssetHubFinalizationTransactions } from "../flows/finalization";
import { createMoneriumInitialTransactions } from "../flows/initial-steps";
import { createPendulumSwapAndSubsidizeTransactions } from "../flows/pendulum";

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareMoneriumToAssethubOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: OnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, polygonEphemeralEntry } =
    validateMoneriumOnramp(quote, signingAccounts);

  if (!quote.metadata.moonbeamToEvm?.outputAmountRaw) {
    throw new Error("Missing moonbeamToEvm output amount in quote metadata");
  }
  const inputTokenPendulumDetails = getPendulumDetails(EvmToken.USDC);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  stateMeta = {
    destinationAddress,
    inputTokenPendulumDetails,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    outputTokenPendulumDetails,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    polygonEphemeralAddress: polygonEphemeralEntry.address,
    walletAddress: destinationAddress
  };

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      await createMoneriumInitialTransactions(
        quote,
        unsignedTxs,
        destinationAddress,
        moonbeamEphemeralEntry,
        polygonEphemeralEntry
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
