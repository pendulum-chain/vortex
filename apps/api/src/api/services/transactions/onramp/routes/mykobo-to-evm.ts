import {
  createOnrampSquidrouterTransactionsFromBaseToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  getOnChainTokenDetailsOrDefault,
  isEvmTokenDetails,
  isNativeEvmToken,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { isAddress } from "viem";
import logger from "../../../../../config/logger";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { StateMetadata } from "../../../phases/meta-state-types";
import {
  EUR_ONRAMP_BASE_CROSS_CHAIN,
  EUR_ONRAMP_BASE_DIRECT,
  EUR_ONRAMP_BASE_SAME_CHAIN,
  EUR_ONRAMP_BASE_SAME_CHAIN_SWAP
} from "../../../phases/ramp-flow-definitions";
import { isEurToEurcBaseDirect } from "../../../quote/utils";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import {
  addDestinationChainApprovalTransaction,
  addNablaSwapTransactionsOnBase,
  addOnrampDestinationChainTransactions
} from "../common/transactions";
import { MykoboOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMykoboOnramp } from "../common/validation";

/**
 * Prepares all transactions for a Mykobo (EUR) onramp to an EVM chain via Base.
 *
 * Flow: user SEPA deposit → EURC on Base ephemeral → Nabla swap EURC→USDC → SquidRouter to destination chain.
 *
 * Unlike Avenia/BRLA, no on-chain mint step is required: Mykobo settles the SEPA deposit
 * directly on the Base ephemeral as EURC. The Mykobo deposit intent is expected to have been
 * created by the caller; its identifiers are threaded into stateMeta.
 */
export async function prepareMykoboToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress,
  mykoboEmail,
  mykoboTransactionId,
  mykoboTransactionReference
}: MykoboOnrampTransactionParams & {
  mykoboTransactionId: string;
  mykoboTransactionReference: string;
}): Promise<OnrampTransactionsWithMeta> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  if (!isAddress(destinationAddress)) {
    throw new Error(`Invalid destination address for EVM route: ${destinationAddress}. Must be a valid EVM address.`);
  }

  const { toNetwork, outputTokenDetails, evmEphemeralEntry, inputTokenDetails } = validateMykoboOnramp(quote, signingAccounts);
  logger.debug(`Starting prepareMykoboToEvmOnrampTransactions with destinationAddress: ${destinationAddress}`);

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
  }

  const isDirectTransfer = isEurToEurcBaseDirect(quote.inputCurrency, quote.outputCurrency, quote.network);
  if (!isDirectTransfer && !quote.metadata.nablaSwapEvm?.outputAmountRaw) {
    throw new Error("Missing nablaSwapEvm.outputAmountRaw in quote metadata for Mykobo onramp");
  }

  if (!isDirectTransfer && !quote.metadata.evmToEvm?.inputAmountRaw) {
    throw new Error("Missing evmToEvm.inputAmountRaw in quote metadata for Mykobo onramp");
  }
  const bridgeInputAmountRaw = quote.metadata.evmToEvm?.inputAmountRaw;

  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    isDirectTransfer,
    mykoboEmail,
    mykoboTransactionId,
    mykoboTransactionReference,
    walletAddress: destinationAddress
  };

  let baseNonce = 0;

  if (isDirectTransfer) {
    const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals).toFixed(0, 0);
    const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
      amountRaw: finalAmountRaw,
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

    return { stateMeta: { ...stateMeta, phaseFlow: EUR_ONRAMP_BASE_DIRECT }, unsignedTxs };
  }

  const nablaSwapOutputTokenAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!nablaSwapOutputTokenAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }
  const eurcInputTokenAddress = (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain;

  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await addNablaSwapTransactionsOnBase(
    {
      account: evmEphemeralEntry,
      inputTokenAddress: eurcInputTokenAddress,
      outputTokenAddress: nablaSwapOutputTokenAddress,
      quote
    },
    unsignedTxs,
    baseNonce
  );
  stateMeta = { ...stateMeta, ...nablaStateMeta };
  baseNonce = nonceAfterNabla;

  baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, baseNonce);

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals).toFixed(0, 0);

  // Special case: onramping USDC on Base. Skip SquidRouter and transfer directly to destination.
  if (toNetwork === Networks.Base && outputTokenDetails.erc20AddressSourceChain === nablaSwapOutputTokenAddress) {
    const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
      amountRaw: finalAmountRaw,
      destinationNetwork: Networks.Base,
      isNativeToken: isNativeEvmToken(outputTokenDetails),
      toAddress: destinationAddress,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });

    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "destinationTransfer",
      signer: evmEphemeralEntry.address,
      txData: finalDestinationTransfer
    });

    const baseFundingAccountAddress = getEvmFundingAccount(Networks.Base).address;

    const eurcCleanupApproval = await prepareBaseCleanupApproval(
      eurcInputTokenAddress as `0x${string}`,
      baseFundingAccountAddress,
      Networks.Base
    );
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupEurc",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(eurcCleanupApproval) as EvmTransactionData
    });

    const usdcCleanupApproval = await prepareBaseCleanupApproval(
      nablaSwapOutputTokenAddress as `0x${string}`,
      baseFundingAccountAddress,
      Networks.Base
    );
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupUsdc",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(usdcCleanupApproval) as EvmTransactionData
    });

    return { stateMeta: { ...stateMeta, phaseFlow: EUR_ONRAMP_BASE_SAME_CHAIN }, unsignedTxs };
  }

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromBaseToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: nablaSwapOutputTokenAddress,
      rawAmount: bridgeInputAmountRaw as string,
      toNetwork,
      toToken: (outputTokenDetails as EvmTokenDetails).erc20AddressSourceChain
    });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "squidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "squidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  // Same-chain Base: destinationTransfer must be the next executable nonce after the swap. Cleanups run
  // post-complete, so they follow the transfer. Backup re-swap txs are omitted here (no handler executes
  // them, and on a shared nonce sequence they would push destinationTransfer beyond the live nonce).
  if (toNetwork === Networks.Base) {
    const sameChainDestinationTransfer = await addOnrampDestinationChainTransactions({
      amountRaw: finalAmountRaw,
      destinationNetwork: Networks.Base,
      isNativeToken: isNativeEvmToken(outputTokenDetails),
      toAddress: destinationAddress,
      toToken: outputTokenDetails.erc20AddressSourceChain
    });
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "destinationTransfer",
      signer: evmEphemeralEntry.address,
      txData: sameChainDestinationTransfer
    });

    const sameChainFundingAddress = getEvmFundingAccount(Networks.Base).address;

    const eurcCleanup = await prepareBaseCleanupApproval(
      eurcInputTokenAddress as `0x${string}`,
      sameChainFundingAddress,
      Networks.Base
    );
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupEurc",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(eurcCleanup) as EvmTransactionData
    });

    const usdcCleanup = await prepareBaseCleanupApproval(
      nablaSwapOutputTokenAddress as `0x${string}`,
      sameChainFundingAddress,
      Networks.Base
    );
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupUsdc",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(usdcCleanup) as EvmTransactionData
    });

    stateMeta = {
      ...stateMeta,
      phaseFlow: EUR_ONRAMP_BASE_SAME_CHAIN_SWAP,
      squidRouterQuoteId,
      squidRouterReceiverHash,
      squidRouterReceiverId
    };

    return { stateMeta, unsignedTxs };
  }

  const baseFundingAccountAddress = getEvmFundingAccount(Networks.Base).address;

  const eurcCleanupApproval = await prepareBaseCleanupApproval(
    eurcInputTokenAddress as `0x${string}`,
    baseFundingAccountAddress,
    Networks.Base
  );
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupEurc",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(eurcCleanupApproval) as EvmTransactionData
  });

  const usdcCleanupApproval = await prepareBaseCleanupApproval(
    nablaSwapOutputTokenAddress as `0x${string}`,
    baseFundingAccountAddress,
    Networks.Base
  );
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupUsdc",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(usdcCleanupApproval) as EvmTransactionData
  });

  let destinationNonce = 0;
  const destinationStartingNonce = destinationNonce;

  const finalDestinationTransfer = await addOnrampDestinationChainTransactions({
    amountRaw: finalAmountRaw,
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

  // Fallback bridged token: USDC for Ethereum, axlUSDC for all other EVM chains. Mirrors avenia-to-evm-base.
  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(toNetwork as Networks, EvmToken.AXLUSDC) as EvmTokenDetails;
  let bridgedTokenForFallback: `0x${string}`;
  if (toNetwork === Networks.Ethereum) {
    const ethereumUsdc = evmTokenConfig.ethereum.USDC;
    if (!ethereumUsdc) {
      throw new Error("USDC config missing for Ethereum");
    }
    bridgedTokenForFallback = ethereumUsdc.erc20AddressSourceChain as `0x${string}`;
  } else {
    bridgedTokenForFallback = destinationAxlUsdcDetails.erc20AddressSourceChain as `0x${string}`;
  }

  const inputAmountRawFinalBridge = bridgeInputAmountRaw as string;

  const { approveData: finalApproveData, swapData: finalSwapData } =
    await createOnrampSquidrouterTransactionsOnDestinationChain({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: bridgedTokenForFallback,
      network: toNetwork as EvmNetworks,
      rawAmount: inputAmountRawFinalBridge,
      toToken: outputTokenDetails.erc20AddressSourceChain
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

  const fundingAccount = getEvmFundingAccount(Networks.Base);

  // Bound approval to bridged amount + 5% slippage cushion (matches avenia-to-evm-base).
  const backupApproveAmountRaw = new Big(inputAmountRawFinalBridge).mul("1.05").toFixed(0, 0);

  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: backupApproveAmountRaw,
    destinationNetwork: toNetwork as EvmNetworks,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedTokenForFallback
  });

  // Nonce 0 on purpose: ensures the approval can land even if other destination-chain txs are missed.
  // When source chain == destination chain, the ephemeral has already consumed nonces 0..N-1, so we
  // reuse destinationTransfer's nonce (the first destination-chain nonce) for the same effect.
  const backupApproveNonce = destinationStartingNonce;
  unsignedTxs.push({
    meta: {},
    network: toNetwork,
    nonce: backupApproveNonce,
    phase: "backupApprove",
    signer: evmEphemeralEntry.address,
    txData: backupApproveTransaction
  });

  stateMeta = {
    ...stateMeta,
    phaseFlow: EUR_ONRAMP_BASE_CROSS_CHAIN,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
