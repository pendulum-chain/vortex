import { FiatToken, isAlfredpayToken, RampDirection, RegisterRampRequest } from "@vortexfi/shared";

export enum RampTransactionPreparationKind {
  OfframpBrl = "offramp-brl",
  OfframpMonerium = "offramp-monerium",
  OfframpNonBrl = "offramp-non-brl",
  OnrampAlfredpay = "onramp-alfredpay",
  OnrampAvenia = "onramp-avenia",
  OnrampMonerium = "onramp-monerium"
}

export interface RampTransactionPreparationQuote {
  inputCurrency: string;
  outputCurrency: string;
  rampType: RampDirection;
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
    return RampTransactionPreparationKind.OnrampMonerium;
  }

  if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
    return RampTransactionPreparationKind.OnrampAlfredpay;
  }

  return RampTransactionPreparationKind.OnrampAvenia;
}
