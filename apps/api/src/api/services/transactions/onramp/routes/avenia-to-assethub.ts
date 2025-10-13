import {
  createPendulumToAssethubTransfer,
  createPendulumToHydrationTransfer,
  encodeSubmittableExtrinsic,
  getNetworkId,
  getPendulumDetails,
  isAssetHubTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import { StateMetadata } from "../../../phases/meta-state-types";
import { buildHydrationSwapTransaction, buildHydrationToAssetHubTransfer } from "../../hydration";
import {
  addFeeDistributionTransaction,
  addMoonbeamTransactions,
  addNablaSwapTransactions,
  addPendulumCleanupTx
} from "../common/transactions";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnramp } from "../common/validation";

/**
 * Prepares all transactions for an Avenia (BRL) onramp to AssetHub.
 * This route handles: BRL → Moonbeam (BRLA) → Pendulum (swap) → AssetHub (final transfer)
 */
export async function prepareAveniaToAssethubOnrampTransactions({
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

  // Build transactions for each network
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    // Moonbeam: Initial BRLA transfer to Pendulum
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      if (!quote.metadata.aveniaMint?.outputAmountRaw) {
        throw new Error("Missing aveniaMint amountOutRaw in quote metadata");
      }
      const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaMint.outputAmountRaw;

      await addMoonbeamTransactions(
        {
          account: moonbeamEphemeralEntry,
          fromToken: inputTokenDetails.moonbeamErc20Address,
          inputAmountRaw: inputAmountPostAnchorFeeRaw,
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          toNetworkId
        },
        unsignedTxs,
        0 // start nonce
      );
    }

    // Pendulum: Nabla swap and fee distribution
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

      // Finalization: Transfer to AssetHub
      const pendulumCleanupTx = await addPendulumCleanupTx({
        account: pendulumEphemeralEntry,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails
      });

      if (quote.outputCurrency === "USDC") {
        if (!quote.metadata.pendulumToAssethubXcm?.inputAmountRaw) {
          throw new Error("Missing input amount for Pendulum to Assethub transfer");
        }
        const transferAmountRaw = quote.metadata.pendulumToAssethubXcm.inputAmountRaw;

        const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
          destinationAddress,
          outputTokenDetails.pendulumRepresentative.currencyId,
          transferAmountRaw
        );

        unsignedTxs.push({
          meta: {},
          network: pendulumEphemeralEntry.network,
          nonce: pendulumNonce,
          phase: "pendulumToAssethubXcm",
          signer: pendulumEphemeralEntry.address,
          txData: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction)
        });
        pendulumNonce++;
      } else {
        if (!quote.metadata.pendulumToHydrationXcm?.inputAmountRaw) {
          throw new Error("Missing input amount for Pendulum to Hydration transfer");
        }
        const transferAmountRaw = quote.metadata.pendulumToHydrationXcm.inputAmountRaw;

        const pendulumToHydrationXcmTransaction = await createPendulumToHydrationTransfer(
          destinationAddress,
          outputTokenDetails.pendulumRepresentative.currencyId,
          transferAmountRaw
        );

        unsignedTxs.push({
          meta: {},
          network: pendulumEphemeralEntry.network,
          nonce: pendulumNonce,
          phase: "pendulumToHydrationXcm",
          signer: pendulumEphemeralEntry.address,
          txData: encodeSubmittableExtrinsic(pendulumToHydrationXcmTransaction)
        });
        pendulumNonce++;

        if (!quote.metadata.hydrationSwap) {
          throw new Error("Missing hydration swap details for Hydration finalization");
        }

        let hydrationNonce = 0;
        const { inputAsset, outputAsset, inputAmountDecimal, outputAmountRaw } = quote.metadata.hydrationSwap;
        const hydrationSwap = await buildHydrationSwapTransaction(
          inputAsset,
          outputAsset,
          inputAmountDecimal,
          pendulumEphemeralEntry.address,
          quote.metadata.hydrationSwap.slippagePercent
        );

        unsignedTxs.push({
          meta: {},
          network: Networks.Hydration,
          nonce: hydrationNonce,
          phase: "hydrationSwap",
          signer: pendulumEphemeralEntry.address,
          txData: encodeSubmittableExtrinsic(hydrationSwap)
        });
        hydrationNonce++;

        // Transfer from Hydration to AssetHub
        if (!isAssetHubTokenDetails(outputTokenDetails)) {
          throw new Error(
            `Output token must be an AssetHub token for finalization to AssetHub, got ${outputTokenDetails.assetSymbol}`
          );
        }
        const hydrationAssetId = outputTokenDetails.hydrationId;
        // biome-ignore lint/style/noNonNullAssertion: Checked by isAssetHubTokenDetails
        const assethubAssetId = outputTokenDetails.isNative ? "native" : outputTokenDetails.foreignAssetId!;

        const hydrationToAssethubTransfer = await buildHydrationToAssetHubTransfer(
          destinationAddress,
          outputAmountRaw,
          hydrationAssetId,
          assethubAssetId
        );

        unsignedTxs.push({
          meta: {},
          network: Networks.Hydration,
          nonce: hydrationNonce,
          phase: "hydrationToAssethubXcm",
          signer: pendulumEphemeralEntry.address,
          txData: encodeSubmittableExtrinsic(hydrationToAssethubTransfer)
        });
      }

      // Add cleanup
      unsignedTxs.push({
        ...pendulumCleanupTx,
        nonce: pendulumNonce
      });
    }
  }

  return { stateMeta, unsignedTxs };
}
