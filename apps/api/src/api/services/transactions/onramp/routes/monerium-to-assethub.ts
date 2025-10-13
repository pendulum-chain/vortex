import {
  AXL_USDC_MOONBEAM,
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  createPendulumToAssethubTransfer,
  createPendulumToHydrationTransfer,
  ERC20_EURE_POLYGON,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  getNetworkId,
  getPendulumDetails,
  isAssetHubTokenDetails,
  Networks,
  PENDULUM_USDC_AXL,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { StateMetadata } from "../../../phases/meta-state-types";
import { buildHydrationSwapTransaction, buildHydrationToAssetHubTransfer } from "../../hydration";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";
import {
  addFeeDistributionTransaction,
  addMoonbeamTransactions,
  addNablaSwapTransactions,
  addPendulumCleanupTx
} from "../common/transactions";
import { MoneriumOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMoneriumOnramp } from "../common/validation";

/**
 * Prepares all transactions for a Monerium (EUR) onramp to AssetHub.
 * This route handles: EUR → Polygon (EURe) → Moonbeam (axlUSDC) → Pendulum (swap) → AssetHub (final transfer)
 */
export async function prepareMoneriumToAssethubOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  moneriumWalletAddress
}: MoneriumOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, polygonEphemeralEntry } =
    validateMoneriumOnramp(quote, signingAccounts);
  const toNetworkId = getNetworkId(toNetwork);

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    moneriumWalletAddress,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    polygonEphemeralAddress: polygonEphemeralEntry.address,
    walletAddress: destinationAddress
  };

  if (!quote.metadata.moneriumMint?.outputAmountRaw) {
    throw new Error("Missing moonbeamToEvm output amount in quote metadata");
  }

  const inputAmountPostAnchorFeeRaw = new Big(quote.metadata.moneriumMint.outputAmountRaw).toFixed(0, 0);
  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, moneriumWalletAddress);

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "moneriumOnrampSelfTransfer",
    signer: moneriumWalletAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

  // Build transactions for each network
  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Polygon)) {
      let polygonAccountNonce = 0;

      const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
        inputAmountPostAnchorFeeRaw,
        moneriumWalletAddress,
        account.address
      );

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "moneriumOnrampSelfTransfer",
        signer: account.address,
        txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
      });

      const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromPolygonToEvm({
        destinationAddress: moneriumWalletAddress,
        fromAddress: account.address,
        fromToken: ERC20_EURE_POLYGON,
        rawAmount: inputAmountPostAnchorFeeRaw,
        toNetwork,
        toToken: AXL_USDC_MOONBEAM
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterApprove",
        signer: account.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterSwap",
        signer: account.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      });
    }

    // Moonbeam: Initial BRLA transfer to Pendulum
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      if (!quote.metadata.evmToMoonbeam?.outputAmountRaw) {
        throw new Error("Missing aveniaMint amountOutRaw in quote metadata");
      }
      const receivedTokensOnMoonbeam = quote.metadata.evmToMoonbeam.outputAmountRaw;

      await addMoonbeamTransactions(
        {
          account: moonbeamEphemeralEntry,
          fromToken: AXL_USDC_MOONBEAM,
          inputAmountRaw: receivedTokensOnMoonbeam,
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          toNetworkId
        },
        unsignedTxs,
        0 // start nonce
      );
    }

    // Pendulum: Nabla swap and transfer to AssetHub
    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const inputTokenPendulumDetails = PENDULUM_USDC_AXL;
      const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

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

      unsignedTxs.push({
        ...pendulumCleanupTx,
        nonce: pendulumNonce
      });
    }
  }

  return { stateMeta, unsignedTxs };
}
