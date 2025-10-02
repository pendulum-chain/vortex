import { DestinationType } from "../helpers";
import { RampDirection } from "../types";
import { Currency } from "./price.endpoints";

export interface GetWidgetUrlLocked {
  quoteId: string;
  externalSessionId: string;
  walletAddressLocked?: string;
  externalTransactionId?: string;
  externalCustomerId?: string;
}

export interface GetWidgetUrlRefresh {
  inputAmount: string;
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  inputCurrency: Currency;
  outputCurrency: Currency;
  externalSessionId: string;
  walletAddressLocked?: string;
  externalTransactionId?: string;
  externalCustomerId?: string;
}

export interface GetWidgetUrlResponse {
  url: string;
}
