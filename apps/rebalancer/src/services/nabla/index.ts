import type { CreateExecuteMessageExtrinsicOptions } from "@pendulum-chain/api-solang";
import type { PendulumTokenDetails } from "../../tokens";
import ApiManager from "../../utils/api-manager.ts";
import { prepareNablaApproveTransaction } from "./approve";
import { prepareNablaSwapTransaction } from "./swap";

export type ExtrinsicOptions = Omit<CreateExecuteMessageExtrinsicOptions, "abi" | "api">;

export async function createNablaTransactions(
  amountRaw: string,
  callerAddress: string,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  nablaHardMinimumOutputRaw: string
) {
  const pendulumNode = await ApiManager.getApi("pendulum");

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    callerAddress,
    inputTokenPendulumDetails,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    callerAddress,
    inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenPendulumDetails,
    pendulumNode
  });

  return {
    approve: {
      extrinsicOptions: approveTransaction.extrinsicOptions,
      transaction: approveTransaction.extrinsic
    },
    swap: {
      extrinsicOptions: swapTransaction.extrinsicOptions,
      transaction: swapTransaction.extrinsic
    }
  };
}
