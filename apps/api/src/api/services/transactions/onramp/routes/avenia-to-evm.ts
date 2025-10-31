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
} from "@vortexfi/shared";
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
  const { toNetwork, outputTokenDetails, substrateEphemeralEntry, evmEphemeralEntry, inputTokenDetails } = validateAveniaOnramp(
    quote,
    signingAccounts
  );
  const toNetworkId = getNetworkId(toNetwork);

  // Get token details
  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    substrateEphemeralAddress: substrateEphemeralEntry.address,
    taxId
  };

  let moonbeamNonce = 0;

  // Moonbeam: Initial BRLA transfer to Pendulum
  if (!quote.metadata.aveniaMint?.outputAmountRaw) {
    throw new Error("Missing aveniaMint amountOutRaw in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaMint.outputAmountRaw;

  moonbeamNonce = await addMoonbeamTransactions(
    {
      account: evmEphemeralEntry,
      fromToken: inputTokenDetails.moonbeamErc20Address,
      inputAmountRaw: inputAmountPostAnchorFeeRaw,
      pendulumEphemeralAddress: substrateEphemeralEntry.address,
      toNetworkId
    },
    unsignedTxs,
    moonbeamNonce
  );

  // Pendulum: Nabla swap and transfer to Moonbeam
  let pendulumNonce = 0;

  // Add Nabla swap transactions
  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactions(
    {
      account: substrateEphemeralEntry,
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
  pendulumNonce = await addFeeDistributionTransaction(quote, substrateEphemeralEntry, unsignedTxs, pendulumNonce);

  // Transfer from Pendulum to Moonbeam
  const pendulumCleanupTx = await addPendulumCleanupTx({
    account: substrateEphemeralEntry,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails
  });

  if (!quote.metadata.pendulumToMoonbeamXcm?.inputAmountRaw || !quote.metadata.moonbeamToEvm?.outputAmountRaw) {
    throw new Error("Missing bridge output amount for Moonbeam");
  }

  const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
    evmEphemeralEntry.address,
    quote.metadata.pendulumToMoonbeamXcm.inputAmountRaw,
    outputTokenDetails.pendulumRepresentative.currencyId
  );

  unsignedTxs.push({
    meta: {},
    network: Networks.Pendulum,
    nonce: pendulumNonce,
    phase: "pendulumToMoonbeamXcm",
    signer: substrateEphemeralEntry.address,
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
    fromAddress: evmEphemeralEntry.address,
    fromToken: AXL_USDC_MOONBEAM_DETAILS.erc20AddressSourceChain,
    moonbeamEphemeralStartingNonce: moonbeamNonce,
    rawAmount: quote.metadata.moonbeamToEvm.outputAmountRaw,
    toNetwork: outputTokenDetails.network,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Moonbeam,
    nonce: moonbeamNonce,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });
  moonbeamNonce++;

  unsignedTxs.push({
    meta: {},
    network: Networks.Moonbeam,
    nonce: moonbeamNonce,
    phase: "squidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });
  moonbeamNonce++;

  return { stateMeta, unsignedTxs };
}
