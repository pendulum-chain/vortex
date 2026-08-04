import {
  EvmClientManager,
  type EvmNetworks,
  type EvmTransactionData,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER
} from "@vortexfi/shared";
import { encodeFunctionData } from "viem/utils";
import erc20ABI from "../../../../../contracts/ERC20";
import {
  assertEthereumGasBudgetWithinLimit,
  EVM_ERC20_TRANSFER_GAS_LIMIT,
  EVM_NATIVE_TRANSFER_GAS_LIMIT
} from "./ethereum-destination-gas";

export function encodeEvmTransactionData(data: unknown) {
  return data;
}

export async function prepareBaseCleanupApproval(
  tokenAddress: `0x${string}`,
  fundingAddress: string,
  network: EvmNetworks
): Promise<EvmTransactionData> {
  const approveCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [fundingAddress, (2n ** 256n - 1n).toString()],
    functionName: "approve"
  });
  const publicClient = EvmClientManager.getInstance().getClient(network);
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  return {
    data: approveCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    to: tokenAddress,
    value: "0"
  };
}

export async function createDestinationTransferTransaction(params: {
  toAddress: string;
  toToken: `0x${string}`;
  amountRaw: string;
  destinationNetwork: EvmNetworks;
  isNativeToken?: boolean;
}): Promise<EvmTransactionData> {
  const { toAddress, amountRaw, destinationNetwork, toToken, isNativeToken } = params;
  const publicClient = EvmClientManager.getInstance().getClient(destinationNetwork);
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
  const gasLimit = isNativeToken ? EVM_NATIVE_TRANSFER_GAS_LIMIT : EVM_ERC20_TRANSFER_GAS_LIMIT;

  if (destinationNetwork === Networks.Ethereum) {
    assertEthereumGasBudgetWithinLimit(gasLimit * maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER);
  }

  if (isNativeToken) {
    return {
      data: "0x",
      gas: EVM_NATIVE_TRANSFER_GAS_LIMIT.toString(),
      maxFeePerGas: String(maxFeePerGas),
      maxPriorityFeePerGas: String(maxPriorityFeePerGas),
      to: toAddress as `0x${string}`,
      value: amountRaw
    };
  }

  return {
    data: encodeFunctionData({ abi: erc20ABI, args: [toAddress, amountRaw], functionName: "transfer" }),
    gas: EVM_ERC20_TRANSFER_GAS_LIMIT.toString(),
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    to: toToken,
    value: "0"
  };
}

export async function createDestinationApprovalTransaction(params: {
  amountRaw: string;
  spenderAddress: string;
  tokenAddress: `0x${string}`;
  destinationNetwork: EvmNetworks;
}): Promise<EvmTransactionData> {
  const { amountRaw, spenderAddress, tokenAddress, destinationNetwork } = params;
  const publicClient = EvmClientManager.getInstance().getClient(destinationNetwork);
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

  return {
    data: encodeFunctionData({ abi: erc20ABI, args: [spenderAddress, amountRaw], functionName: "approve" }),
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxPriorityFeePerGas),
    to: tokenAddress,
    value: "0"
  };
}
