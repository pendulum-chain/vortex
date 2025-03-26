import { QuoteTicketAttributes } from '../../../../models/quoteTicket.model';
import { ApiManager } from '../../pendulum/apiManager';
import { prepareNablaSwapTransaction } from './swap';
import { prepareNablaApproveTransaction } from './approve';
import { AccountMeta } from '../../ramp/ramp.service';
import { getNetworkFromDestination, Networks } from '../../../helpers/networks';
import { encodeSubmittableExtrinsic } from '../index';
import Big from 'big.js';
import { getPendulumDetails } from '../../../../config/tokens';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';

export async function createNablaTransactionsForQuote(quote: QuoteTicketAttributes, ephemeral: AccountMeta) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (quote.rampType === 'off' && !fromNetwork) {
    throw new Error(`Cannot create Nabla transactions for invalid fromNetwork ${quote.from}`);
  }
  const toNetwork = getNetworkFromDestination(quote.to);
  if (quote.rampType === 'on' && !toNetwork) {
    throw new Error(`Cannot create Nabla transactions for invalid toNetwork ${quote.to}`);
  }

  const inputTokenPendulumDetails =
    quote.rampType === 'on'
      ? getPendulumDetails(quote.inputCurrency)
      : getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails =
    quote.rampType === 'on'
      ? getPendulumDetails(quote.outputCurrency, toNetwork)
      : getPendulumDetails(quote.outputCurrency);

  const amountRaw = multiplyByPowerOfTen(
    new Big(quote.inputAmount),
    inputTokenPendulumDetails.pendulumDecimals,
  ).toFixed(0, 0);
  const pendulumEphemeralAddress = ephemeral.address;
  const nablaHardMinimumOutputRaw = new Big(quote.outputAmount).add(new Big(quote.fee)).toFixed(0, 0); // TODO we're not allowing subsidy anymore?

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
