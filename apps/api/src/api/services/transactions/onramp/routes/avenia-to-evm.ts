import {
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsFromMoonbeamToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  createPendulumToMoonbeamTransfer,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  evmTokenConfig,
  getNetworkId,
  getOnChainTokenDetailsOrDefault,
  getPendulumDetails,
  isEvmTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../../constants/constants";
import { StateMetadata } from "../../../phases/meta-state-types";
import { addFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import {
  addDestinationChainApprovalTransaction,
  addMoonbeamTransactions,
  addNablaSwapTransactions,
  addOnrampDestinationChainTransactions,
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
  if (!quote.metadata.aveniaTransfer?.outputAmountRaw) {
    throw new Error("Missing aveniaTransfer amountOutRaw in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaTransfer.outputAmountRaw;

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

  if (!quote.metadata.pendulumToMoonbeamXcm?.inputAmountRaw || !quote.metadata.moonbeamToEvm?.inputAmountRaw) {
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

  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toNetwork as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;

  const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromMoonbeamToEvm({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: evmEphemeralEntry.address,
    fromToken: AXL_USDC_MOONBEAM_DETAILS.erc20AddressSourceChain,
    moonbeamEphemeralStartingNonce: moonbeamNonce,
    rawAmount: quote.metadata.moonbeamToEvm.inputAmountRaw,
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

  // Fallback swap depends on the EVM chain. For Ethereum, the bridged token is USDC. For the rest, it is axlUSDC.
  const bridgedTokenForFallback =
    toNetwork === Networks.Ethereum
      ? evmTokenConfig.ethereum.USDC!.erc20AddressSourceChain
      : destinationAxlUsdcDetails.erc20AddressSourceChain;

  const { approveData: destApproveData, swapData: destSwapData } = await createOnrampSquidrouterTransactionsOnDestinationChain({
    destinationAddress: evmEphemeralEntry.address,
    fromAddress: evmEphemeralEntry.address,
    fromToken: bridgedTokenForFallback,
    network: toNetwork as EvmNetworks,
    rawAmount: quote.metadata.moonbeamToEvm.inputAmountRaw,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  let destinationNonce = 0;

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals);
  const finalSettlementTransaction = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "destinationTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalSettlementTransaction
  });

  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(destApproveData) as EvmTransactionData
  });
  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(destSwapData) as EvmTransactionData
  });
  destinationNonce++;

  const maxUint256 = 2n ** 256n - 1n;
  const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);

  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: maxUint256.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedTokenForFallback
  });

  // We set this to 0 on purpose because we don't want to risk that the required nonce is never reached
  const backupApproveNonce = 0;
  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: backupApproveNonce,
    phase: "backupApprove",
    signer: evmEphemeralEntry.address,
    txData: backupApproveTransaction
  });

  return { stateMeta, unsignedTxs };
}
