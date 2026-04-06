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
  isNativeEvmToken,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../../constants/constants";
import { StateMetadata } from "../../../phases/meta-state-types";
import { addEvmFeeDistributionTransaction, addFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import {
  addDestinationChainApprovalTransaction,
  addMoonbeamTransactions,
  addNablaSwapTransactions,
  addNablaSwapTransactionsOnBase,
  addOnrampDestinationChainTransactions,
  addPendulumCleanupTx
} from "../common/transactions";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnramp, validateAveniaOnrampOnBase } from "../common/validation";

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

  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "destinationTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalDestinationTransfer
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

/**
 * Prepares all transactions for an Avenia (BRL) onramp to EVM chain via Base.
 * This route handles: BRL → Base (BRLA) -> Swap (to USDC) → EVM (final transfer)
 */
export async function prepareAveniaToEvmOnrampTransactionsOnBase({
  quote,
  signingAccounts,
  destinationAddress,
  taxId
}: AveniaOnrampTransactionParams): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, evmEphemeralEntry, inputTokenDetails } = validateAveniaOnrampOnBase(
    quote,
    signingAccounts
  );

  // Setup state metadata
  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    taxId
  };

  let baseNonce = 0;

  if (!quote.metadata.aveniaTransfer?.outputAmountRaw) {
    throw new Error("Missing aveniaTransfer amountOutRaw in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaTransfer.outputAmountRaw;

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
  }

  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toNetwork as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;

  // Output for BRLA onramp will always go through USDC.
  // TODO. Unless the actual BRLA token )
  const nablaSwapOutputTokenAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!nablaSwapOutputTokenAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }

  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactionsOnBase(
    {
      account: evmEphemeralEntry,
      inputTokenAddress: (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain,
      outputTokenAddress: nablaSwapOutputTokenAddress,
      quote
    },
    unsignedTxs,
    baseNonce
  );
  stateMeta = { ...stateMeta, ...nablaStateMeta };
  baseNonce = nonceAfterNabla;

  baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, baseNonce);

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals);

  // Special case, onramping USDC on Base. We need to skip the SquidRouter step and go directly to the destination transfer.
  if (toNetwork === Networks.Base && outputTokenDetails.erc20AddressSourceChain === nablaSwapOutputTokenAddress) {
    const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
      amountRaw: finalAmountRaw.toString(),
      destinationNetwork: Networks.Base,
      isNativeToken: isNativeEvmToken(outputTokenDetails),
      toAddress: destinationAddress,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce,
      phase: "destinationTransfer",
      signer: evmEphemeralEntry.address,
      txData: finalDestinationTransfer
    });

    return { stateMeta, unsignedTxs };
  }

  // Fallback swap depends on the EVM chain. For Ethereum, the bridged token is USDC. For the rest, it is axlUSDC.
  const bridgedTokenForFallback =
    toNetwork === Networks.Ethereum
      ? evmTokenConfig.ethereum.USDC!.erc20AddressSourceChain
      : destinationAxlUsdcDetails.erc20AddressSourceChain;

  // Destination chain: Squidrouter swap to final token
  const { approveData: finalApproveData, swapData: finalSwapData } =
    await createOnrampSquidrouterTransactionsOnDestinationChain({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: bridgedTokenForFallback,
      network: toNetwork as EvmNetworks,
      rawAmount: inputAmountPostAnchorFeeRaw,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

  let destinationNonce = 0;

  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw.toString(),
    destinationNetwork: toNetwork as EvmNetworks,
    isNativeToken: isNativeEvmToken(outputTokenDetails),
    toAddress: destinationAddress,
    toToken: outputTokenDetails.erc20AddressSourceChain
  });

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "destinationTransfer",
    signer: evmEphemeralEntry.address,
    txData: finalDestinationTransfer
  });

  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalApproveData) as EvmTransactionData
  });
  destinationNonce++;

  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: destinationNonce,
    phase: "backupSquidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalSwapData) as EvmTransactionData
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
