import {
  AccountMeta,
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsFromMoonbeamToEvm,
  createPendulumToAssethubTransfer,
  createPendulumToHydrationTransfer,
  createPendulumToMoonbeamTransfer,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  Networks,
  OnChainTokenDetails,
  PendulumTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { buildHydrationSwapTransaction, buildHydrationToAssetHubTransfer } from "../../hydration";
import { encodeEvmTransactionData } from "../../index";
import { addPendulumCleanupTx } from "../common/transactions";

export async function createAssetHubFinalizationTransactions(
  quote: QuoteTicketAttributes,
  pendulumEphemeralEntry: AccountMeta,
  outputTokenDetails: OnChainTokenDetails,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  destinationAddress: string,
  unsignedTxs: UnsignedTx[],
  pendulumNonce: number
) {
  const pendulumCleanupTx = await addPendulumCleanupTx({
    account: pendulumEphemeralEntry,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails
  });

  if (quote.outputCurrency === "USDC") {
    if (!quote.metadata.pendulumToAssethubXcm?.inputAmountRaw) {
      throw new Error("Missing input amount for Pendulum to Assethub transfer");
    }

    const transferAmountRaw = quote.metadata.pendulumToAssethubXcm?.inputAmountRaw;

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
    const transferAmountRaw = quote.metadata.pendulumToHydrationXcm?.inputAmountRaw;
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
    const { assetIn, assetOut, amountIn, amountOutRaw } = quote.metadata.hydrationSwap;
    const hydrationSwap = await buildHydrationSwapTransaction(assetIn, assetOut, amountIn, pendulumEphemeralEntry.address);

    unsignedTxs.push({
      meta: {},
      network: Networks.Hydration,
      nonce: hydrationNonce,
      phase: "hydrationSwap",
      signer: pendulumEphemeralEntry.address,
      txData: encodeSubmittableExtrinsic(hydrationSwap)
    });
    hydrationNonce++;

    if (!isAssetHubTokenDetails(outputTokenDetails)) {
      throw new Error(
        `Output token must be an AssetHub token for finalization to AssetHub, got ${outputTokenDetails.assetSymbol}`
      );
    }
    const hydrationAssetId = outputTokenDetails.hydrationId;

    // biome-ignore lint/style/noNonNullAssertion: Can't be undefined if it's not native
    const assethubAssetId = outputTokenDetails.isNative ? "native" : outputTokenDetails.foreignAssetId!;

    const hydrationToAssethubTransfer = await buildHydrationToAssetHubTransfer(
      destinationAddress,
      amountOutRaw,
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
    hydrationNonce++;
  }

  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: pendulumNonce
  });
  pendulumNonce++;

  return pendulumNonce;
}

/// Creates the transactions transferring axlUSDC from Pendulum to Moonbeam, then swapping it to the desired EVM token via Squidrouter.
export async function createBRLAToEvmFinalizationTransactions(
  quote: QuoteTicketAttributes,
  pendulumEphemeralEntry: AccountMeta,
  moonbeamEphemeralEntry: AccountMeta,
  outputTokenDetails: OnChainTokenDetails,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  unsignedTxs: UnsignedTx[],
  pendulumNonce: number,
  moonbeamNonce: number
) {
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
    phase: "pendulumToMoonbeam",
    signer: pendulumEphemeralEntry.address,
    txData: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction)
  });
  pendulumNonce++;

  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: pendulumNonce
  });
  pendulumNonce++;

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
  }

  const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromMoonbeamToEvm({
    destinationAddress: quote.to,
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

  return { moonbeamNonce, pendulumNonce };
}
