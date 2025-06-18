import { AccountMeta, encodeSubmittableExtrinsic, Networks, PendulumDetails } from "@packages/shared";
import { CreateExecuteMessageExtrinsicOptions } from "@pendulum-chain/api-solang";
import { ApiManager } from "../../pendulum/apiManager";
import { prepareNablaApproveTransaction } from "./approve";
import { prepareNablaSwapTransaction } from "./swap";

export type ExtrinsicOptions = Omit<CreateExecuteMessageExtrinsicOptions, "abi" | "api">;

export async function createNablaTransactionsForOfframp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumDetails,
  outputTokenPendulumDetails: PendulumDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenDetails: inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenDetails: inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenDetails: outputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  return {
    approve: {
      extrinsicOptions: approveTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic)
    },
    swap: {
      extrinsicOptions: swapTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic)
    }
  };
}

export async function createNablaTransactionsForOnramp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumDetails,
  outputTokenPendulumDetails: PendulumDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenDetails: inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenDetails: inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenDetails: outputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  return {
    approve: {
      extrinsicOptions: approveTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic)
    },
    swap: {
      extrinsicOptions: swapTransaction.extrinsicOptions,
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic)
    }
  };
}
