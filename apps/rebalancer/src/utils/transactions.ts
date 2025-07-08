import { PublicClient } from "viem";

export async function waitForTransactionConfirmation(txHash: string, publicClient: PublicClient): Promise<void> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`
    });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} failed or was not found`);
    }
  } catch (error) {
    throw new Error(`Error waiting for transaction confirmation: ${error}`);
  }
}
