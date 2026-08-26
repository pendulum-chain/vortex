import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  EphemeralAccountType,
  EvmClientManager,
  EvmToken,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { config } from "../../../../../../config/vars";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import type { PrepareCtx, PreparedPhaseTxs } from "../../core/types";
import {
  POLYGON_EURE,
  POLYGON_EURE_USDC_FEE,
  POLYGON_UNISWAP_V3_ROUTER,
  POLYGON_USDC,
  UNISWAP_APPROVE_GAS_LIMIT,
  UNISWAP_SWAP_GAS_LIMIT,
  uniswapV3RouterAbi
} from "./contract";
import type { UniswapV3FixedSwapMetadata } from "./simulation";

export interface UniswapV3FixedSwapPreparation {
  deadline: string;
  hardMinimumOutputRaw: string;
  softMinimumOutputRaw: string;
}

export interface UniswapV3TransactionDependencies {
  now?: () => number;
  probeFees?: () => Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
}

export async function prepareUniswapV3FixedSwapTxs(
  ctx: PrepareCtx<UniswapV3FixedSwapMetadata>,
  dependencies: UniswapV3TransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const ephemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM);
  const probe = dependencies.probeFees
    ? await dependencies.probeFees()
    : await EvmClientManager.getInstance().getClient(Networks.Polygon).estimateFeesPerGas();
  const softMinimumOutputRaw = new Big(ctx.ownMetadata.outputAmountRaw)
    .mul(new Big(1).minus(AMM_MINIMUM_OUTPUT_SOFT_MARGIN))
    .toFixed(0, 0);
  const hardMinimumOutputRaw = new Big(ctx.ownMetadata.outputAmountRaw)
    .mul(new Big(1).minus(AMM_MINIMUM_OUTPUT_HARD_MARGIN))
    .toFixed(0, 0);
  const deadline = BigInt(Math.floor((dependencies.now?.() ?? Date.now()) / 1000) + config.swap.deadlineMinutes * 60);
  const feeFields = {
    maxFeePerGas: probe.maxFeePerGas.toString(),
    maxPriorityFeePerGas: probe.maxPriorityFeePerGas.toString()
  };
  const prefund = (gas: bigint) => (gas * probe.maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER).toString();

  return {
    intents: [
      {
        lane: "main",
        network: Networks.Polygon,
        phase: "uniswapApprove",
        prefundNativeValueRaw: prefund(UNISWAP_APPROVE_GAS_LIMIT),
        signer: ephemeral.address,
        txData: {
          data: encodeFunctionData({
            abi: erc20Abi,
            args: [POLYGON_UNISWAP_V3_ROUTER, BigInt(ctx.ownMetadata.inputAmountRaw)],
            functionName: "approve"
          }),
          ...feeFields,
          gas: UNISWAP_APPROVE_GAS_LIMIT.toString(),
          to: POLYGON_EURE,
          value: "0"
        }
      },
      {
        lane: "main",
        network: Networks.Polygon,
        phase: "uniswapSwap",
        prefundNativeValueRaw: prefund(UNISWAP_SWAP_GAS_LIMIT),
        signer: ephemeral.address,
        txData: {
          data: encodeFunctionData({
            abi: uniswapV3RouterAbi,
            args: [
              {
                amountIn: BigInt(ctx.ownMetadata.inputAmountRaw),
                amountOutMinimum: BigInt(hardMinimumOutputRaw),
                deadline,
                fee: POLYGON_EURE_USDC_FEE,
                recipient: ephemeral.address as `0x${string}`,
                sqrtPriceLimitX96: 0n,
                tokenIn: POLYGON_EURE,
                tokenOut: POLYGON_USDC
              }
            ],
            functionName: "exactInputSingle"
          }),
          ...feeFields,
          gas: UNISWAP_SWAP_GAS_LIMIT.toString(),
          to: POLYGON_UNISWAP_V3_ROUTER,
          value: "0"
        }
      },
      {
        lane: "cleanup",
        network: Networks.Polygon,
        phase: "polygonCleanup",
        prefundNativeValueRaw: prefund(UNISWAP_APPROVE_GAS_LIMIT),
        signer: ephemeral.address,
        txData: {
          data: encodeFunctionData({
            abi: erc20Abi,
            args: [getEvmFundingAccount(Networks.Polygon).address, maxUint256],
            functionName: "approve"
          }),
          ...feeFields,
          gas: UNISWAP_APPROVE_GAS_LIMIT.toString(),
          to: POLYGON_USDC,
          value: "0"
        }
      }
    ],
    state: { deadline: deadline.toString(), hardMinimumOutputRaw, softMinimumOutputRaw } satisfies UniswapV3FixedSwapPreparation
  };
}
