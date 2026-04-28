import {
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isAlfredpayToken,
  isEvmTokenDetails,
  OnChainToken
} from "@vortexfi/shared";
import { OfframpTransactionParams, OfframpTransactionsWithMeta } from "./common/types";
import { prepareAssethubToBRLOfframpTransactions } from "./routes/assethub-to-brl";
import { prepareAssethubToStellarOfframpTransactions } from "./routes/assethub-to-stellar";
import { prepareEvmToAlfredpayOfframpTransactions } from "./routes/evm-to-alfredpay";
import { prepareEvmToBRLOfframpBaseTransactions } from "./routes/evm-to-brl-base";
import { prepareEvmToMoneriumEvmOfframpTransactions } from "./routes/evm-to-monerium-evm";
import { prepareEvmToStellarOfframpTransactions } from "./routes/evm-to-stellar";

export async function prepareOfframpTransactions(params: OfframpTransactionParams): Promise<OfframpTransactionsWithMeta> {
  const { quote } = params;

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  // Route to appropriate handler based on input source and output destination
  if (quote.outputCurrency === FiatToken.BRL) {
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken);
    if (inputTokenDetails && isEvmTokenDetails(inputTokenDetails)) {
      return prepareEvmToBRLOfframpBaseTransactions(params);
    } else {
      return prepareAssethubToBRLOfframpTransactions(params);
    }
  } else if (quote.outputCurrency === FiatToken.EURC && params.moneriumAuthToken) {
    // Monerium EVM offramp
    return prepareEvmToMoneriumEvmOfframpTransactions(params);
  } else if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
    // Alfredpay offramp (USD, MXN, COP)
    return prepareEvmToAlfredpayOfframpTransactions(params);
  } else {
    // Stellar offramp
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken);
    if (inputTokenDetails && isEvmTokenDetails(inputTokenDetails)) {
      return prepareEvmToStellarOfframpTransactions(params);
    } else {
      return prepareAssethubToStellarOfframpTransactions(params);
    }
  }
}
