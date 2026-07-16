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
  BRL_ONRAMP_BASE_CROSS_CHAIN,
  BRL_ONRAMP_BASE_DIRECT,
  BRL_ONRAMP_BASE_SAME_CHAIN
} from "../../../phases/ramp-flow-definitions";
import { isBrlToBrlaBaseDirect } from "../../../quote/utils";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import {
  addDestinationChainApprovalTransaction,
  addNablaSwapTransactionsOnBase,
  addOnrampDestinationChainTransactions
} from "../common/transactions";
import { AveniaOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateAveniaOnrampOnBase } from "../common/validation";

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

  // Validate that destinationAddress is a valid EVM address for EVM routes
  if (!isAddress(destinationAddress)) {
    throw new Error(`Invalid destination address for EVM route: ${destinationAddress}. Must be a valid EVM address.`);
  }

  // Validate inputs and extract required data
  const { toNetwork, outputTokenDetails, evmEphemeralEntry, inputTokenDetails } = validateAveniaOnrampOnBase(
    quote,
    signingAccounts
  );
  logger.debug(`Starting prepareAveniaToEvmOnrampTransactionsOnBase with destinationAddress: ${destinationAddress}`);
  const isDirectTransfer = isBrlToBrlaBaseDirect(quote.inputCurrency, quote.outputCurrency, quote.network);
  // Setup state metadata
  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    isDirectTransfer,
    taxId
  };

  let baseNonce = 0;

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
  }

  // BRL→BRLA on Base: Avenia already minted the requested BRLA, so no Nabla swap, fee-token
  // conversion, or SquidRouter step is needed — transfer the minted BRLA straight to the user.
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

    return { stateMeta: { ...stateMeta, phaseFlow: BRL_ONRAMP_BASE_DIRECT }, unsignedTxs };
  }

  if (!quote.metadata.aveniaTransfer?.outputAmountRaw) {
    throw new Error("Missing aveniaTransfer amountOutRaw in quote metadata");
  }

  if (!quote.metadata.evmToEvm?.inputAmountRaw) {
    throw new Error("Missing evmToEvm inputAmountRaw in quote metadata");
  }

  // Output for BRLA onramp will always go through USDC.
  // TODO. Unless the actual BRLA token wants to be onramped.
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

  const finalAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outputTokenDetails.decimals).toFixed(0, 0);

  // Special case, onramping USDC on Base. We need to skip the SquidRouter step and go directly to the destination transfer.
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
    const brlaTokenAddress = (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain as `0x${string}`;

    const brlaCleanupApproval = await prepareBaseCleanupApproval(brlaTokenAddress, baseFundingAccountAddress, Networks.Base);
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupBrla",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(brlaCleanupApproval) as EvmTransactionData
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

    return { stateMeta: { ...stateMeta, phaseFlow: BRL_ONRAMP_BASE_SAME_CHAIN }, unsignedTxs };
  }

  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromBaseToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: nablaSwapOutputTokenAddress,
      rawAmount: quote.metadata.evmToEvm?.inputAmountRaw,
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
    const sameChainBrlaAddress = (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain as `0x${string}`;

    const brlaCleanup = await prepareBaseCleanupApproval(sameChainBrlaAddress, sameChainFundingAddress, Networks.Base);
    unsignedTxs.push({
      meta: {},
      network: Networks.Base,
      nonce: baseNonce++,
      phase: "baseCleanupBrla",
      signer: evmEphemeralEntry.address,
      txData: encodeEvmTransactionData(brlaCleanup) as EvmTransactionData
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
      squidRouterQuoteId,
      squidRouterReceiverHash,
      squidRouterReceiverId
    };

    return { stateMeta: { ...stateMeta, phaseFlow: BRL_ONRAMP_BASE_SAME_CHAIN }, unsignedTxs };
  }

  const baseFundingAccountAddress = getEvmFundingAccount(Networks.Base).address;
  const brlaTokenAddress = (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain as `0x${string}`;

  const brlaCleanupApproval = await prepareBaseCleanupApproval(brlaTokenAddress, baseFundingAccountAddress, Networks.Base);
  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
    phase: "baseCleanupBrla",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(brlaCleanupApproval) as EvmTransactionData
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

  // Fallback swap depends on the EVM chain. For Ethereum, the bridged token is USDC. For the rest, it is axlUSDC.
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

  const inputAmountRawFinalBridge = quote.metadata.evmToEvm?.inputAmountRaw;
  if (!inputAmountRawFinalBridge) {
    throw new Error("Missing input amount for final bridge in quote metadata");
  }

  // Destination chain: Squidrouter swap to final token
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

  // Bound approval to the bridged amount + 5% slippage cushion (replaces unbounded maxUint256).
  const backupApproveAmountRaw = new Big(inputAmountRawFinalBridge).mul("1.05").toFixed(0, 0);

  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: backupApproveAmountRaw,
    destinationNetwork: toNetwork as EvmNetworks,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedTokenForFallback
  });

  // We set this to the destinationTransfer nonce on purpose because we don't want to risk that the required nonce is never reached
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
    phaseFlow: BRL_ONRAMP_BASE_CROSS_CHAIN,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
