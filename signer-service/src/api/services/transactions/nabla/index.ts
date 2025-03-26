import { QuoteTicketAttributes } from '../../../../models/quoteTicket.model';
import { ApiManager } from '../../pendulum/apiManager';
import { prepareNablaSwapTransaction } from './swap';
import { prepareNablaApproveTransaction } from './approve';
import { AccountMeta } from '../../ramp/ramp.service';
import { getNetworkFromDestination, Networks } from '../../../helpers/networks';
import { encodeSubmittableExtrinsic } from '../index';

export async function createNablaTransactionsForQuote(quote: QuoteTicketAttributes, ephemeral: AccountMeta) {
  if (ephemeral.network !== Networks.Pendulum) {
    throw new Error(`Can't create Nabla transactions for ${ephemeral.network}`);
  }

  const apiManager = ApiManager.getInstance();
  const networkName = 'pendulum';
  const pendulumNode = await apiManager.getApi(networkName);

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Cannot create Nabla transactions for invalid fromNetwork ${quote.from}`);
  }
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Cannot create Nabla transactions for invalid toNetwork ${quote.to}`);
  }

  const amountRaw = quote.inputAmount;
  const pendulumEphemeralAddress = ephemeral.address;
  const nablaHardMinimumOutputRaw = quote.outputAmount;

  const approveTransaction = await prepareNablaApproveTransaction({
    fromNetwork,
    inputCurrency: quote.inputCurrency,
    amountRaw,
    pendulumEphemeralAddress,
    pendulumNode,
  });

  const swapTransaction = await prepareNablaSwapTransaction({
    fromNetwork,
    toNetwork,
    inputCurrency: quote.inputCurrency,
    outputCurrency: quote.outputCurrency,
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
