import { ERC20_EURC_BASE, EvmClientManager, EvmTransactionData } from "@vortexfi/shared";
import { encodeFunctionData } from "viem";
import erc20ABI from "../../../../../contracts/ERC20";
import { MYKOBO_BASE_NETWORK } from "../../../mykobo";

// Pulls EURC from the Mykobo-controlled wallet into the ephemeral via ERC-20 `transferFrom`.
// The ephemeral previously signed an EIP-2612 permit authorising this allowance.
export async function createMykoboPullToEphemeralOnBase(
  amountRaw: string,
  mykoboWalletAddress: string,
  ephemeralAddress: string
): Promise<EvmTransactionData> {
  const evmClientManager = EvmClientManager.getInstance();
  const baseClient = evmClientManager.getClient(MYKOBO_BASE_NETWORK);

  const transferCallData = encodeFunctionData({
    abi: erc20ABI,
    args: [mykoboWalletAddress, ephemeralAddress, amountRaw],
    functionName: "transferFrom"
  });

  const { maxFeePerGas } = await baseClient.estimateFeesPerGas();

  const txData: EvmTransactionData = {
    data: transferCallData as `0x${string}`,
    gas: "100000",
    maxFeePerGas: String(maxFeePerGas),
    maxPriorityFeePerGas: String(maxFeePerGas),
    to: ERC20_EURC_BASE,
    value: "0"
  };

  return txData;
}
