import { ERC20_EURE_POLYGON_V2, EvmClientManager, EvmTransactionData, Networks } from "@vortexfi/shared";
import { encodeFunctionData } from "viem";
import { SANDBOX_ENABLED } from "../../../../../constants/constants";
import erc20ABI from "../../../../../contracts/ERC20";

// TODO Deprecated
export async function createOnrampUserApprove(amountRaw: string, toAddress: string): Promise<EvmTransactionData> {
  throw new Error("Deprecated - createOnrampUserApprove");
}

export async function createOnrampEphemeralSelfTransfer(
  amountRaw: string,
  fromAddress: string,
  toAddress: string
): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const network = SANDBOX_ENABLED ? Networks.PolygonAmoy : Networks.Polygon;
  const polygonClient = evmClientManager.getClient(network);

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
    to: ERC20_EURE_POLYGON_V2,
    value: "0"
  };

  return txData;
}
