import {
  EphemeralAccountType,
  EvmClientManager,
  type EvmTransactionData,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER
} from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { config } from "../../../../../../config/vars";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { BASE_PAXG_ADDRESS } from "../../core/gold-base";
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
 *
 * The cleanup approval covers PAXG in every state after that: once the main lane's nonces are used, the funding account
 * can take whatever PAXG the ephemeral holds. That is a buy's surplus after completion, or a sale's PAXG that the swap
 * never took.
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
  const funding = getEvmFundingAccount(Networks.Base).address;
  const approve = (token: string, spender: string, amount: bigint): EvmTransactionData => ({
    data: encodeFunctionData({ abi: erc20Abi, args: [spender as `0x${string}`, amount], functionName: "approve" }),
    ...fees,
    gas: UNISWAP_APPROVE_GAS_LIMIT.toString(),
    to: token as `0x${string}`,
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
        txData: approve(swap.inputToken, swap.router, amountIn)
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
        txData: approve(swap.inputToken, funding, amountIn)
      },
      {
        lane: "cleanup",
        network: Networks.Base,
        phase: "baseCleanupPaxg",
        prefundNativeValueRaw: prefund(UNISWAP_APPROVE_GAS_LIMIT),
        signer,
        txData: approve(BASE_PAXG_ADDRESS, funding, maxUint256)
      }
    ],
    state: { swapDeadline: deadline.toString() } satisfies GoldSwapState
  };
}
