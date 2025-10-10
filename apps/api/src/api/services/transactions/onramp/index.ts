import { FiatToken, Networks } from "@packages/shared";
import { AveniaOnrampTransactionParams, OnrampTransactionParams, OnrampTransactionsWithMeta } from "./common/types";
import { prepareAveniaToAssethubOnrampTransactions } from "./routes/avenia-to-assethub";
import { prepareAveniaToEvmOnrampTransactions } from "./routes/avenia-to-evm";
import { prepareMoneriumToAssethubOnrampTransactions } from "./routes/monerium-to-assethub";
import { prepareMoneriumToEvmOnrampTransactions } from "./routes/monerium-to-evm";

export async function prepareOnrampTransactions(
  params: OnrampTransactionParams & { taxId?: string }
): Promise<OnrampTransactionsWithMeta> {
  const { quote } = params;

  // Route based on input currency and destination network
  if (quote.inputCurrency === FiatToken.BRL) {
    if (!params.taxId) {
      throw new Error("taxId is required for Avenia onramp");
    }

    const aveniaParams: AveniaOnrampTransactionParams = { ...params, taxId: params.taxId };

    if (quote.to === Networks.AssetHub) {
      return prepareAveniaToAssethubOnrampTransactions(aveniaParams);
    } else {
      return prepareAveniaToEvmOnrampTransactions(aveniaParams);
    }
  } else if (quote.inputCurrency === FiatToken.EURC) {
    if (quote.to === Networks.AssetHub) {
      return prepareMoneriumToAssethubOnrampTransactions(params);
    } else {
      return prepareMoneriumToEvmOnrampTransactions(params);
    }
  } else {
    throw new Error(`Unsupported input currency: ${quote.inputCurrency}`);
  }
}
