import {
  EphemeralAccountType,
  EvmClientManager,
  type EvmTransactionData,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER
} from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi } from "viem";
import { config } from "../../../../../../config/vars";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import { encodeUniswapSwap, UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";
import type { GoldSwapState } from "../uniswap-v3-fixed-swap/route";
import type { UniswapV3TransactionDependencies } from "../uniswap-v3-fixed-swap/transactions";
import type { GoldSwapMetadata } from "./simulation";

/**
 * The ephemeral's exact approval and swap through the pinned pool, with the output staying on the ephemeral. The backup
 * approval is operator recovery only: pinned to the first main nonce and signed for the four after it, it lets the
 * funding account take the swap's input back while the ephemeral has sent at most four transactions. A Pix buy with a
 * partner markup has sent five once its swap approval is mined, so there it only helps before that approval.
 */
export async function prepareGoldSwapTxs(
  ctx: PrepareCtx<GoldSwapMetadata>,
  dependencies: UniswapV3TransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const signer = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address as `0x${string}`;
  const { swap } = ctx.ownMetadata;
  const probe = dependencies.probeFees
    ? await dependencies.probeFees()
    : await EvmClientManager.getInstance().getClient(Networks.Base).estimateFeesPerGas();
  const fees = {
    maxFeePerGas: probe.maxFeePerGas.toString(),
    maxPriorityFeePerGas: probe.maxPriorityFeePerGas.toString()
  };
  const prefund = (gas: bigint) => (gas * probe.maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER).toString();
  const deadline = BigInt(Math.floor((dependencies.now?.() ?? Date.now()) / 1000) + config.swap.deadlineMinutes * 60);
  const amountIn = BigInt(swap.inputAmountRaw);
  const approve = (spender: string): EvmTransactionData => ({
    data: encodeFunctionData({ abi: erc20Abi, args: [spender as `0x${string}`, amountIn], functionName: "approve" }),
    ...fees,
    gas: UNISWAP_APPROVE_GAS_LIMIT.toString(),
    to: swap.inputToken as `0x${string}`,
    value: "0"
  });

  return {
    intents: [
      {
        lane: "main",
        network: Networks.Base,
        phase: "uniswapApprove",
        prefundNativeValueRaw: prefund(UNISWAP_APPROVE_GAS_LIMIT),
        signer,
        txData: approve(swap.router)
      },
      {
        lane: "main",
        network: Networks.Base,
        phase: "uniswapSwap",
        prefundNativeValueRaw: prefund(UNISWAP_SWAP_GAS_LIMIT),
        signer,
        txData: {
          data: encodeUniswapSwap(swap.routerKind, {
            amountIn,
            amountOutMinimum: BigInt(swap.hardMinimumOutputRaw),
            deadline,
            path: swap.path as `0x${string}`,
            recipient: signer
          }),
          ...fees,
          gas: UNISWAP_SWAP_GAS_LIMIT.toString(),
          to: swap.router as `0x${string}`,
          value: "0"
        }
      },
      {
        lane: "backup",
        network: Networks.Base,
        phase: "backupApprove",
        reuseFirstMainNonce: true,
        signer,
        txData: approve(getEvmFundingAccount(Networks.Base).address)
      }
    ],
    state: { swapDeadline: deadline.toString() } satisfies GoldSwapState
  };
}
