import { AccountMeta, ApiManager, encodeSubmittableExtrinsic, Networks, PendulumTokenDetails } from "@packages/shared";
import { CreateExecuteMessageExtrinsicOptions } from "@pendulum-chain/api-solang";
import { prepareNablaApproveTransaction } from "./approve";
import { prepareNablaSwapTransaction } from "./swap";

export type ExtrinsicOptions = Omit<CreateExecuteMessageExtrinsicOptions, "abi" | "api">;

export async function createNablaTransactionsForOfframp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.type !== "Substrate") {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.type}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenPendulumDetails,
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
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.type !== "Substrate") {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.type}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    pendulumEphemeralAddress,
    pendulumNode
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    amountRaw,
    inputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    outputTokenPendulumDetails,
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
