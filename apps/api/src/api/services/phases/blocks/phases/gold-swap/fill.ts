import { EvmClientManager, Networks } from "@vortexfi/shared";
import { erc20Abi, isAddressEqual, keccak256, parseEventLogs } from "viem";
import type RampState from "../../../../../../models/rampState.model";
import { GOLD_SWAP_CONTEXT_KEY, type GoldSwapState } from "../uniswap-v3-fixed-swap/route";

/** How often a receipt that is not visible yet is read again, a second apart, before the swap counts as unreadable. */
const RECEIPT_READS = 4;

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
  const hash = keccak256(swapTransaction);
  // The swap step has just seen this receipt, but the next read may reach a node that lags behind it.
  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  for (let read = 1; read <= RECEIPT_READS && !receipt; read++) {
    receipt = await client.getTransactionReceipt({ hash }).catch(error => {
      if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return null;
      throw error;
    });
    if (!receipt && read < RECEIPT_READS) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (receipt?.status !== "success") return null;
  return parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter(log => isAddressEqual(log.address, outputToken) && isAddressEqual(log.args.to, ephemeral))
    .reduce((sum, log) => sum + log.args.value, 0n);
}

/** Whether the Gold swap of this ramp was mined without the API having sent it. */
export function goldSwapSentOutsideApi(state: RampState): boolean {
  return (state.state.blockState?.[GOLD_SWAP_CONTEXT_KEY] as GoldSwapState | undefined)?.sentOutsideApi === true;
}

/**
 * Why a top-up of `topUpRaw` must not be sent, or null when it only covers what the swap itself fell short of its
 * quote. Anything beyond that left the ephemeral some other way, and the funding wallet does not replace it. A swap
 * the API did not send gets no top-up at all: its fill was the sender's choice.
 */
export function refuseGoldTopUp(
  topUpRaw: bigint,
  quotedOutputRaw: bigint,
  fill: bigint | null,
  sentOutsideApi = false
): string | null {
  if (sentOutsideApi) return "the swap was not broadcast by the API, so its fill is not made whole";
  if (fill === null) return "the swap has no successful receipt to measure the top-up against";
  const swapShortfall = quotedOutputRaw > fill ? quotedOutputRaw - fill : 0n;
  return topUpRaw > swapShortfall
    ? `a top-up of ${topUpRaw} exceeds the ${swapShortfall} the swap fell short of its quote, so funds left the ephemeral another way`
    : null;
}
