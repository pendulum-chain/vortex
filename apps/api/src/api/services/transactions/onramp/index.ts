import { FiatToken, Networks } from "@vortexfi/shared";
import {
  AveniaOnrampTransactionParams,
  MoneriumOnrampTransactionParams,
  OnrampTransactionParams,
  OnrampTransactionsWithMeta
} from "./common/types";
import { prepareAlfredpayToEvmOnrampTransactions } from "./routes/alfredpay-to-evm";
import { prepareAveniaToAssethubOnrampTransactions } from "./routes/avenia-to-assethub";
import { prepareAveniaToEvmOnrampTransactions } from "./routes/avenia-to-evm";
import { prepareMoneriumToAssethubOnrampTransactions } from "./routes/monerium-to-assethub";
import { prepareMoneriumToEvmOnrampTransactions } from "./routes/monerium-to-evm";

export async function prepareOnrampTransactions(
  params: AveniaOnrampTransactionParams | MoneriumOnrampTransactionParams | OnrampTransactionParams
): Promise<OnrampTransactionsWithMeta> {
  const { quote } = params;

  // Route based on input currency and destination network
  if (quote.inputCurrency === FiatToken.BRL) {
    if (!("taxId" in params)) {
      throw new Error("taxId is required for Avenia onramp");
    }

    const aveniaParams: AveniaOnrampTransactionParams = { ...params, taxId: params.taxId };

    if (quote.to === Networks.AssetHub) {
      return prepareAveniaToAssethubOnrampTransactions(aveniaParams);
    } else {
      return prepareAveniaToEvmOnrampTransactions(aveniaParams);
    }
  } else if (quote.inputCurrency === FiatToken.EURC) {
    if (!("moneriumWalletAddress" in params)) {
      throw new Error("moneriumWalletAddress is required for Monerium onramp");
    }

    if (quote.to === Networks.AssetHub) {
      return prepareMoneriumToAssethubOnrampTransactions(params);
    } else {
      return prepareMoneriumToEvmOnrampTransactions(params);
    }
  } else if (quote.inputCurrency === FiatToken.USD) {
    if (quote.to !== Networks.AssetHub) {
      return prepareAlfredpayToEvmOnrampTransactions(params);
    } else {
      throw new Error(`Unsupported destination network for Alfredpay onramp: ${quote.to}`);
    }
  } else {
    throw new Error(`Unsupported input currency: ${quote.inputCurrency}`);
  }
}
