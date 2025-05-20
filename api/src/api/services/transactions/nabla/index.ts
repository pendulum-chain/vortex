import { AccountMeta, Networks, PendulumDetails, encodeSubmittableExtrinsic } from 'shared';
import Big from 'big.js';
import { QuoteTicketAttributes } from '../../../../models/quoteTicket.model';
import { ApiManager } from '../../pendulum/apiManager';
import { prepareNablaSwapTransaction } from './swap';
import { prepareNablaApproveTransaction } from './approve';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';

export async function createNablaTransactionsForOfframp(
  quote: QuoteTicketAttributes,
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

  const amountRaw = multiplyByPowerOfTen(
    new Big(quote.inputAmount),
    inputTokenPendulumDetails.pendulumDecimals,
  ).toFixed(0, 0);
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
    approveTransaction: encodeSubmittableExtrinsic(approveTransaction),
    swapTransaction: encodeSubmittableExtrinsic(swapTransaction),
  };
}

export async function createNablaTransactionsForOnramp(
  inputAmountUnits: Big,
  quote: QuoteTicketAttributes,
  ephemeral: AccountMeta,
  inputTokenPendulumDetails: PendulumDetails,
  outputTokenPendulumDetails: PendulumDetails,
  nablaHardMinimumOutputRaw: string
) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const amountRaw = multiplyByPowerOfTen(inputAmountUnits, inputTokenPendulumDetails.pendulumDecimals).toFixed(0, 0);
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
    approveTransaction: encodeSubmittableExtrinsic(approveTransaction),
    swapTransaction: encodeSubmittableExtrinsic(swapTransaction),
  };
}
