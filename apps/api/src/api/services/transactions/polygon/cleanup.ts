import { EvmClientManager, EvmNetworks, EvmTransactionData } from "@vortexfi/shared";
import { encodeFunctionData } from "viem/utils";
import erc20ABI from "../../../../contracts/ERC20";

export async function preparePolygonCleanupApproval(
  tokenAddress: `0x${string}`,
  fundingAddress: string,
  network: EvmNetworks
): Promise<EvmTransactionData> {
  const maxUint256 = (2n ** 256n - 1n).toString();

  const approveCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [fundingAddress, maxUint256],
    functionName: "approve"
  });

  const evmClientManager = EvmClientManager.getInstance();
  const publicClient = evmClientManager.getClient(network);
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
