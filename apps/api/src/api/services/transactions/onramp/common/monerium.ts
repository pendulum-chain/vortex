import { ERC20_EURE_POLYGON, EvmClientManager, EvmTransactionData, Networks } from "@packages/shared";
import { encodeFunctionData } from "viem";
import erc20ABI from "../../../../../contracts/ERC20";

export async function createOnrampUserApprove(amountRaw: string, toAddress: string): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(Networks.Polygon);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [toAddress, amountRaw],
    functionName: "approve"
  });

  const { maxFeePerGas } = await polygonClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURE_POLYGON,
    value: "0"
  };

  return txData;
}

export async function createOnrampEphemeralSelfTransfer(
  amountRaw: string,
  fromAddress: string,
  toAddress: string
): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const polygonClient = evmClientManager.getClient(Networks.Polygon);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [fromAddress, toAddress, amountRaw],
    functionName: "transferFrom"
  });

  const { maxFeePerGas } = await polygonClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURE_POLYGON,
    value: "0"
  };

  return txData;
}
