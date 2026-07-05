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
import { prepareEvmToAlfredpayOfframpTransactions } from "./routes/evm-to-alfredpay";
import { prepareEvmToBRLOfframpBaseTransactions } from "./routes/evm-to-brl-base";
import { prepareEvmToMykoboOfframpTransactions } from "./routes/evm-to-mykobo";

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
  } else if (quote.outputCurrency === FiatToken.EURC) {
    // Mykobo EUR offramp on Base (EVM-only path)
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency as OnChainToken);
    if (!inputTokenDetails || !isEvmTokenDetails(inputTokenDetails)) {
      throw new Error("Mykobo EUR offramp requires an EVM source chain");
    }
    return prepareEvmToMykoboOfframpTransactions(params);
  } else if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
    // Alfredpay offramp (USD, MXN, COP, ARS)
    return prepareEvmToAlfredpayOfframpTransactions(params);
  }

  throw new Error(`Unsupported offramp output currency: ${quote.outputCurrency}`);
}
