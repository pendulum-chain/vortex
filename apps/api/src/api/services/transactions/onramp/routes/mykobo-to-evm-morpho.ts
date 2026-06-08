import {
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  EvmTransactionData,
  evmTokenConfig,
  isEvmTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../config/logger";
import erc20ABI from "../../../../../contracts/ERC20";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { StateMetadata } from "../../../phases/meta-state-types";
import { EUR_ONRAMP_BASE_MORPHO } from "../../../phases/ramp-flow-definitions";
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
 * Prepares all transactions for a Mykobo (EUR) onramp that deposits into a Morpho vault on Base.
 *
 * Flow: user SEPA deposit → EURC on Base ephemeral → Nabla swap EURC→USDC → Morpho vault deposit.
 * No SquidRouter bridge — the Morpho vault is on Base and accepts USDC.
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

  const morphoVault = getMorphoVaultInfo("usdc-base");
  const depositAmountRaw = quote.metadata.nablaSwapEvm.outputAmountRaw;

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

  const baseClient = EvmClientManager.getInstance().getClient(Networks.Base);
  const { maxFeePerGas, maxPriorityFeePerGas } = await baseClient.estimateFeesPerGas();

  // Morpho approval: approve vault to spend the deposit asset (USDC)
  const approveCallData = encodeFunctionData({
    abi: erc20Abi,
    args: [morphoVault.vaultAddress, BigInt(depositAmountRaw)],
    functionName: "approve"
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
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

  // Morpho deposit: deposit USDC into the vault
  const depositCallData = encodeFunctionData({
    abi: morphoVaultAbi,
    args: [BigInt(depositAmountRaw), evmEphemeralEntry.address as `0x${string}`],
    functionName: "deposit"
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Base,
    nonce: baseNonce++,
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

  // Cleanup approvals for post-complete token recovery
  const baseFundingAccountAddress = (
    await import("../../../phases/evm-funding").then(m => m.getEvmFundingAccount(Networks.Base))
  ).address;

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

  stateMeta = { ...stateMeta, phaseFlow: EUR_ONRAMP_BASE_MORPHO };

  return { stateMeta, unsignedTxs };
}
