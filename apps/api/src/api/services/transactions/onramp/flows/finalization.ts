import {
  AccountMeta,
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsFromMoonbeamToEvm,
  createPendulumToAssethubTransfer,
  createPendulumToHydrationTransfer,
  createPendulumToMoonbeamTransfer,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  isEvmTokenDetails,
  OnChainTokenDetails,
  PendulumTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
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

  const finalOutputAmountRaw = multiplyByPowerOfTen(
    new Big(quote.outputAmount),
    outputTokenDetails.pendulumRepresentative.decimals
  ).toFixed(0, 0);

  if (quote.outputCurrency === "USDC") {
    const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
      destinationAddress,
      outputTokenDetails.pendulumRepresentative.currencyId,
      finalOutputAmountRaw
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
    const pendulumToHydrationXcmTransaction = await createPendulumToHydrationTransfer(
      destinationAddress,
      outputTokenDetails.pendulumRepresentative.currencyId,
      finalOutputAmountRaw // FIXME possibly adjust this
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

    // TODO create other transactions for hydration, ie. the swap and transfer to destinationAddress on Assethub
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

  if (!quote.metadata.bridge?.outputAmountMoonbeamRaw) {
    throw new Error("Missing bridge output amount for Moonbeam");
  }

  const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
    moonbeamEphemeralEntry.address,
    quote.metadata.bridge.outputAmountMoonbeamRaw,
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
    rawAmount: quote.metadata.bridge.outputAmountMoonbeamRaw,
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
