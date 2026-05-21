import { ERC20_EURE_POLYGON_V2, EvmClientManager, EvmTransactionData, Networks } from "@vortexfi/shared";
import { encodeFunctionData } from "viem";
import { config } from "../../../../../config/vars";
import erc20ABI from "../../../../../contracts/ERC20";

export const MONERIUM_SELF_TRANSFER_GAS_LIMIT = "300000";

export async function createOnrampEphemeralSelfTransfer(
  amountRaw: string,
  fromAddress: string,
  toAddress: string
): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const network = config.sandboxEnabled ? Networks.PolygonAmoy : Networks.Polygon;
  const polygonClient = evmClientManager.getClient(network);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [fromAddress, toAddress, amountRaw],
    functionName: "transferFrom"
  });

  const { maxFeePerGas } = await polygonClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: MONERIUM_SELF_TRANSFER_GAS_LIMIT,
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURE_POLYGON_V2,
    value: "0"
  };

  return txData;
}
