import { FiatToken, isAlfredpayToken, Networks, RampDirection, RegisterRampRequest } from "@vortexfi/shared";

export enum RampTransactionPreparationKind {
  OfframpBrl = "offramp-brl",
  OfframpMonerium = "offramp-monerium",
  OfframpNonBrl = "offramp-non-brl",
  OnrampAlfredpay = "onramp-alfredpay",
  OnrampAvenia = "onramp-avenia",
  OnrampMonerium = "onramp-monerium",
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
  additionalData?: RegisterRampRequest["additionalData"]
): RampTransactionPreparationKind {
  if (quote.rampType === RampDirection.SELL) {
    if (quote.outputCurrency === FiatToken.BRL) {
      return RampTransactionPreparationKind.OfframpBrl;
    }

    return additionalData?.moneriumAuthToken
      ? RampTransactionPreparationKind.OfframpMonerium
      : RampTransactionPreparationKind.OfframpNonBrl;
  }

  if (quote.inputCurrency === FiatToken.EURC) {
    return quote.to === Networks.AssetHub
      ? RampTransactionPreparationKind.OnrampMonerium
      : RampTransactionPreparationKind.OnrampMykobo;
  }

  if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
    return RampTransactionPreparationKind.OnrampAlfredpay;
  }

  return RampTransactionPreparationKind.OnrampAvenia;
}
