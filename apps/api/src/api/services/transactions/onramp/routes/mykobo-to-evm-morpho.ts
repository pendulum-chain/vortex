import {
  createOnrampSquidrouterTransactionsFromBaseToEvm,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  isEvmTokenDetails,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../config/logger";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { StateMetadata } from "../../../phases/meta-state-types";
import { EUR_ONRAMP_BASE_MORPHO, EUR_ONRAMP_MORPHO } from "../../../phases/ramp-flow-definitions";
import { prepareBaseCleanupApproval } from "../../base/cleanup";
import { addEvmFeeDistributionTransaction } from "../../common/feeDistribution";
import { encodeEvmTransactionData } from "../../index";
import { addNablaSwapTransactionsOnBase } from "../common/transactions";
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
 * Prepares all transactions for a Mykobo (EUR) onramp that deposits into a Morpho vault.
 *
 * Two variants:
 *   - Base vault: user SEPA deposit → EURC on Base ephemeral → Nabla swap EURC→USDC
 *     → Morpho vault deposit on Base. No SquidRouter bridge.
 *   - Non-Base vault: same as above, but then SquidRouter bridges USDC from Base to
 *     the vault's chain, where the Morpho deposit executes.
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

  const { evmEphemeralEntry, inputTokenDetails } = validateMykoboOnramp(quote, signingAccounts);
  logger.debug(`Starting prepareMykoboToEvmMorphoOnrampTransactions with destinationAddress: ${destinationAddress}`);

  if (!isEvmTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be an EVM token for Morpho onramp, got ${inputTokenDetails.assetSymbol}`);
  }

  if (!quote.metadata.nablaSwapEvm?.outputAmountRaw) {
    throw new Error("Missing nablaSwapEvm.outputAmountRaw in quote metadata for Morpho onramp");
  }

  const morphoVault = getMorphoVaultInfo("usdc-arbitrum");
  const morphoNetwork = morphoVault.network as EvmNetworks;
  const isBaseVault = morphoNetwork === Networks.Base;

  // For Base vaults, the deposit amount equals the Nabla swap output directly. For
  // non-Base vaults, the deposit amount is the bridge output (USDC that lands on the
  // vault's chain after the SquidRouter bridge).
  const depositAmountRaw = isBaseVault
    ? (quote.metadata.nablaSwapEvm.outputAmountRaw as string)
    : quote.metadata.evmToEvm?.outputAmountRaw;
  if (!depositAmountRaw) {
    throw new Error(
      isBaseVault
        ? "Missing nablaSwapEvm.outputAmountRaw in quote metadata for Base Morpho onramp"
        : "Missing evmToEvm.outputAmountRaw in quote metadata for Morpho onramp"
    );
  }

  const bridgeInputAmountRaw = isBaseVault ? null : quote.metadata.evmToEvm?.inputAmountRaw;
  if (!isBaseVault && !bridgeInputAmountRaw) {
    throw new Error("Missing evmToEvm.inputAmountRaw in quote metadata for Morpho onramp");
  }

  stateMeta = {
    destinationAddress,
    evmEphemeralAddress: evmEphemeralEntry.address,
    isDirectTransfer: false,
    morphoDepositAmountRaw: depositAmountRaw,
    morphoDepositAssetAddress: morphoVault.depositAssetAddress,
    morphoNetwork,
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

  // 3. SquidRouter bridge (only when the vault is on a chain other than Base).
  let squidRouterQuoteId: string | undefined;
  if (!isBaseVault) {
    const {
      approveData,
      swapData,
      squidRouterQuoteId: quoteId
    } = await createOnrampSquidrouterTransactionsFromBaseToEvm({
      destinationAddress: evmEphemeralEntry.address,
      fromAddress: evmEphemeralEntry.address,
      fromToken: nablaSwapOutputTokenAddress,
      rawAmount: bridgeInputAmountRaw as string,
      toNetwork: morphoNetwork,
      toToken: morphoVault.depositAssetAddress as `0x${string}`
    });
    squidRouterQuoteId = quoteId;

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
  }

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

  // 5. Vault chain (morphoNetwork) transactions
  const morphoClient = EvmClientManager.getInstance().getClient(morphoNetwork);
  const { maxFeePerGas, maxPriorityFeePerGas } = await morphoClient.estimateFeesPerGas();

  // Morpho approval: approve vault to spend the deposit asset (USDC)
  const approveCallData = encodeFunctionData({
    abi: erc20Abi,
    args: [morphoVault.vaultAddress, BigInt(depositAmountRaw)],
    functionName: "approve"
  });

  unsignedTxs.push({
    meta: {},
    network: morphoNetwork,
    nonce: isBaseVault ? baseNonce : 0,
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

  // Morpho deposit: deposit USDC into the vault on morphoNetwork
  const depositCallData = encodeFunctionData({
    abi: morphoVaultAbi,
    args: [BigInt(depositAmountRaw), destinationAddress as `0x${string}`],
    functionName: "deposit"
  });

  unsignedTxs.push({
    meta: {},
    network: morphoNetwork,
    nonce: isBaseVault ? baseNonce + 1 : 1,
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

  stateMeta = {
    ...stateMeta,
    phaseFlow: isBaseVault ? EUR_ONRAMP_BASE_MORPHO : EUR_ONRAMP_MORPHO,
    squidRouterQuoteId
  };

  return { stateMeta, unsignedTxs };
}
