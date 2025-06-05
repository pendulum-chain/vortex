import { CreateExecuteMessageExtrinsicOptions } from '@pendulum-chain/api-solang';
import { AccountMeta, Networks, PendulumDetails, encodeSubmittableExtrinsic } from 'shared';
import { ApiManager } from '../../pendulum/apiManager';
import { prepareNablaApproveTransaction } from './approve';
import { prepareNablaSwapTransaction } from './swap';

export type ExtrinsicOptions = Omit<CreateExecuteMessageExtrinsicOptions, 'abi' | 'api'>;

export async function createNablaTransactionsForOfframp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumDetails,
  outputTokenPendulumDetails: PendulumDetails,
  nablaHardMinimumOutputRaw: string,
) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    inputTokenDetails: inputTokenPendulumDetails,
    amountRaw,
    pendulumEphemeralAddress,
    pendulumNode,
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    inputTokenDetails: inputTokenPendulumDetails,
    outputTokenDetails: outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    amountRaw,
    pendulumEphemeralAddress,
    pendulumNode,
  });

  return {
    approve: {
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic),
      extrinsicOptions: approveTransaction.extrinsicOptions,
    },
    swap: {
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic),
      extrinsicOptions: swapTransaction.extrinsicOptions,
    },
  };
}

export async function createNablaTransactionsForOnramp(
  amountRaw: string,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumDetails,
  outputTokenPendulumDetails: PendulumDetails,
  nablaHardMinimumOutputRaw: string,
) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const pendulumEphemeralAddress = ephemeral.address;

  const approveTransaction = await prepareNablaApproveTransaction({
    inputTokenDetails: inputTokenPendulumDetails,
    amountRaw,
    pendulumEphemeralAddress,
    pendulumNode,
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    inputTokenDetails: inputTokenPendulumDetails,
    outputTokenDetails: outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw,
    amountRaw,
    pendulumEphemeralAddress,
    pendulumNode,
  });

  return {
    approve: {
      transaction: encodeSubmittableExtrinsic(approveTransaction.extrinsic),
      extrinsicOptions: approveTransaction.extrinsicOptions,
    },
    swap: {
      transaction: encodeSubmittableExtrinsic(swapTransaction.extrinsic),
      extrinsicOptions: swapTransaction.extrinsicOptions,
    },
  };
}
