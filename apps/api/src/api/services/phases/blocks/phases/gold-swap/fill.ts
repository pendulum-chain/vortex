import { EvmClientManager, Networks } from "@vortexfi/shared";
import { erc20Abi, isAddressEqual, keccak256, parseEventLogs } from "viem";

/**
 * What the pinned pool paid the ephemeral, read from the receipt of the presigned swap itself. Null when that swap has
 * no successful receipt.
 *
 * The customer holds the ephemeral's key, and both USDC and PAXG accept signed transfers, so the ephemeral's balance
 * alone does not show whether a gap to the quote is the pool's doing. A top-up is therefore measured against this.
 */
export async function readGoldSwapFill(
  swapTransaction: `0x${string}`,
  outputToken: `0x${string}`,
  ephemeral: `0x${string}`
): Promise<bigint | null> {
  const client = EvmClientManager.getInstance().getClient(Networks.Base);
  const receipt = await client.getTransactionReceipt({ hash: keccak256(swapTransaction) }).catch(error => {
    if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return null;
    throw error;
  });
  if (receipt?.status !== "success") return null;
  return parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter(log => isAddressEqual(log.address, outputToken) && isAddressEqual(log.args.to, ephemeral))
    .reduce((sum, log) => sum + log.args.value, 0n);
}

/**
 * Why a top-up of `topUpRaw` must not be sent, or null when it only covers what the swap itself fell short of its
 * quote. Anything beyond that left the ephemeral some other way, and the funding wallet does not replace it.
 */
export function refuseGoldTopUp(topUpRaw: bigint, quotedOutputRaw: bigint, fill: bigint | null): string | null {
  if (fill === null) return "the swap has no successful receipt to measure the top-up against";
  const swapShortfall = quotedOutputRaw > fill ? quotedOutputRaw - fill : 0n;
  return topUpRaw > swapShortfall
    ? `a top-up of ${topUpRaw} exceeds the ${swapShortfall} the swap fell short of its quote, so funds left the ephemeral another way`
    : null;
}
