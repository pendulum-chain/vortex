import {
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  OnChainToken
} from "@vortexfi/shared";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "./common/types";
import { prepareEvmToBRLOfframpBaseTransactions } from "./routes/evm-to-brl-base";

export async function prepareOfframpTransactions(params: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const { quote } = params;

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  // Route to appropriate handler based on input source and output destination
  if (quote.outputCurrency === FiatToken.BRL) {
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken);
    if (!inputTokenDetails || !isEvmTokenDetails(inputTokenDetails)) {
      throw new Error("Legacy BRL transaction preparation requires an EVM source");
    }
    return prepareEvmToBRLOfframpBaseTransactions(params);
  }

  throw new Error(`Unsupported offramp output currency: ${quote.outputCurrency}`);
}
