import {
  createOnrampSquidrouterTransactionsFromBaseToEvm,
  createOnrampSquidrouterTransactionsOnDestinationChain,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  getOnChainTokenDetailsOrDefault,
  isEvmTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../config/logger";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { StateMetadata } from "../../../phases/meta-state-types";
import { EUR_ONRAMP_BASE_MORPHO } from "../../../phases/ramp-flow-definitions";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import { addDestinationChainApprovalTransaction, addNablaSwapTransactionsOnBase } from "../common/transactions";
import { MykoboOnrampTransactionParams, OnrampTransactionsWithMeta } from "../common/types";
import { validateMykoboOnramp } from "../common/validation";

const morphoVaultAbi = [
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" }
    ],
    name: "deposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

/**
 * Prepares all transactions for a Mykobo (EUR) onramp that deposits into a Morpho vault on Ethereum.
 *
 * Flow: user SEPA deposit → EURC on Base ephemeral → Nabla swap EURC→USDC → SquidRouter to Ethereum (USDC) → Morpho vault deposit on Ethereum.
 */
export async function prepareMykoboToEvmMorphoOnrampTransactions({
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

  const { toNetwork, outputTokenDetails, evmEphemeralEntry, inputTokenDetails } = validateMykoboOnramp(quote, signingAccounts);
  logger.debug(`Starting prepareMykoboToEvmMorphoOnrampTransactions with destinationAddress: ${destinationAddress}`);

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be an EVM token for Morpho onramp, got ${inputTokenDetails.assetSymbol}`);
  }

  if (!quote.metadata.nablaSwapEvm?.outputAmountRaw) {
    throw new Error("Missing nablaSwapEvm.outputAmountRaw in quote metadata for Morpho onramp");
  }

  if (!quote.metadata.evmToEvm?.inputAmountRaw) {
    throw new Error("Missing evmToEvm.inputAmountRaw in quote metadata for Morpho onramp");
  }

  if (!quote.metadata.evmToEvm?.outputAmountRaw) {
    throw new Error("Missing evmToEvm.outputAmountRaw in quote metadata for Morpho onramp");
  }

  const morphoVault = getMorphoVaultInfo("usdc-ethereum");
  const bridgeInputAmountRaw = quote.metadata.evmToEvm.inputAmountRaw;
  const depositAmountRaw = quote.metadata.evmToEvm.outputAmountRaw;

  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    isDirectTransfer: false,
    morphoDepositAmountRaw: depositAmountRaw,
    morphoDepositAssetAddress: morphoVault.depositAssetAddress,
    morphoShareTokenAddress: morphoVault.vaultAddress,
    morphoVaultAddress: morphoVault.vaultAddress,
    mykoboEmail,
    mykoboTransactionId,
    mykoboTransactionReference,
    walletAddress: destinationAddress
  };

  let baseNonce = 0;

  const nablaSwapOutputTokenAddress = evmTokenConfig[Networks.Base][EvmToken.USDC]?.erc20AddressSourceChain;
  if (!nablaSwapOutputTokenAddress) {
    throw new Error("Invalid USDC configuration for Base in evmTokenConfig");
  }
  const eurcInputTokenAddress = (inputTokenDetails as EvmTokenDetails).erc20AddressSourceChain;

  // 1. Nabla Swap: EURC -> USDC on Base
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

  // 2. Fee Distribution on Base
  baseNonce = await addEvmFeeDistributionTransaction(quote, evmEphemeralEntry, unsignedTxs, baseNonce);

  // 3. SquidRouter Swap: USDC on Base -> USDC on Ethereum
  const { approveData, swapData, squidRouterQuoteId, squidRouterReceiverId, squidRouterReceiverHash } =
    await createOnrampSquidrouterTransactionsFromBaseToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: nablaSwapOutputTokenAddress,
      rawAmount: bridgeInputAmountRaw,
      toNetwork: Networks.Ethereum,
      toToken: morphoVault.depositAssetAddress // USDC on Ethereum
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

  // 4. Base Cleanups
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

  // 5. Destination chain (Ethereum) transactions
  let destinationNonce = 0;
  const destinationStartingNonce = destinationNonce;

  const ethereumClient = EvmClientManager.getInstance().getClient(Networks.Ethereum);
  const { maxFeePerGas, maxPriorityFeePerGas } = await ethereumClient.estimateFeesPerGas();

  // Morpho approval: approve vault to spend the deposit asset (USDC)
  const approveCallData = encodeFunctionData({
    abi: erc20Abi,
    args: [morphoVault.vaultAddress, BigInt(depositAmountRaw)],
    functionName: "approve"
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Ethereum,
    nonce: destinationNonce++,
    phase: "morphoApprove",
    signer: evmEphemeralEntry.address,
    txData: {
      data: approveCallData as `0x${string}`,
      gas: "100000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: morphoVault.depositAssetAddress as `0x${string}`,
      value: "0"
    } as EvmTransactionData
  });

  // Morpho deposit: deposit USDC into the vault on Ethereum
  const depositCallData = encodeFunctionData({
    abi: morphoVaultAbi,
    args: [BigInt(depositAmountRaw), destinationAddress as `0x${string}`],
    functionName: "deposit"
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Ethereum,
    nonce: destinationNonce++,
    phase: "morphoDeposit",
    signer: evmEphemeralEntry.address,
    txData: {
      data: depositCallData as `0x${string}`,
      gas: "500000",
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: morphoVault.vaultAddress as `0x${string}`,
      value: "0"
    } as EvmTransactionData
  });

  // 6. Backup transactions on Ethereum (in case axlUSDC lands instead of USDC)
  const destinationAxlUsdcDetails = getOnChainTokenDetailsOrDefault(Networks.Ethereum, EvmToken.AXLUSDC) as EvmTokenDetails;
  const bridgedTokenForFallback = destinationAxlUsdcDetails.erc20AddressSourceChain as `0x${string}`;
  // TODO triple-check, if squidrouter fails, does it deposit axlUSDC on destination as well for the Ethereum case?
  // or is this destination different ?

  const { approveData: finalApproveData, swapData: finalSwapData } =
    await createOnrampSquidrouterTransactionsOnDestinationChain({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: bridgedTokenForFallback,
      network: Networks.Ethereum,
      rawAmount: bridgeInputAmountRaw,
      toToken: morphoVault.depositAssetAddress // swap to USDC
    });

  unsignedTxs.push({
    meta: {},
    network: Networks.Ethereum,
    nonce: destinationNonce++,
    phase: "backupSquidRouterApprove",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalApproveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Ethereum,
    nonce: destinationNonce++,
    phase: "backupSquidRouterSwap",
    signer: evmEphemeralEntry.address,
    txData: encodeEvmTransactionData(finalSwapData) as EvmTransactionData
  });

  const fundingAccount = getEvmFundingAccount(Networks.Base);
  const backupApproveAmountRaw = new Big(bridgeInputAmountRaw).mul("1.05").toFixed(0, 0);

  const backupApproveTransaction = await addDestinationChainApprovalTransaction({
    amountRaw: backupApproveAmountRaw,
    destinationNetwork: Networks.Ethereum,
    spenderAddress: fundingAccount.address,
    tokenAddress: bridgedTokenForFallback
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Ethereum,
    nonce: destinationStartingNonce,
    phase: "backupApprove",
    signer: evmEphemeralEntry.address,
    txData: backupApproveTransaction
  });

  stateMeta = {
    ...stateMeta,
    phaseFlow: EUR_ONRAMP_BASE_MORPHO,
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };

  return { stateMeta, unsignedTxs };
}
