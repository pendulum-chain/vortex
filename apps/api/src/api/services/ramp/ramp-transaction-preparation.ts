import { FiatToken, isAlfredpayToken, RampDirection, RegisterRampRequest } from "@vortexfi/shared";

export enum RampTransactionPreparationKind {
  OfframpBrl = "offramp-brl",
  OfframpNonBrl = "offramp-non-brl",
  OnrampAlfredpay = "onramp-alfredpay",
  OnrampAvenia = "onramp-avenia",
  OnrampMykobo = "onramp-mykobo"
}

export interface RampTransactionPreparationQuote {
  inputCurrency: string;
  outputCurrency: string;
  rampType: RampDirection;
  to?: string;
}

export function selectRampTransactionPreparationKind(
  quote: RampTransactionPreparationQuote,
  _additionalData?: RegisterRampRequest["additionalData"]
): RampTransactionPreparationKind {
  if (quote.rampType === RampDirection.SELL) {
    if (quote.outputCurrency === FiatToken.BRL) {
      return RampTransactionPreparationKind.OfframpBrl;
    }

    return RampTransactionPreparationKind.OfframpNonBrl;
  }

  if (quote.inputCurrency === FiatToken.EURC) {
    return RampTransactionPreparationKind.OnrampMykobo;
  }

  if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
    return RampTransactionPreparationKind.OnrampAlfredpay;
  }

  return RampTransactionPreparationKind.OnrampAvenia;
}
