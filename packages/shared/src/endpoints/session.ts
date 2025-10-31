import { FiatToken, Networks, OnChainToken, PaymentMethod, RampDirection } from "../index";

export interface GetWidgetUrlLocked {
  quoteId: string;
  callbackUrl?: string;
  externalSessionId: string;
  walletAddressLocked?: string;
}

export interface GetWidgetUrlRefresh {
  apiKey?: string;
  callbackUrl?: string;
  countryCode?: string;
  cryptoLocked?: OnChainToken;
  externalSessionId: string;
  fiat?: FiatToken;
  inputAmount: string;
  network: Networks;
  partnerId?: string;
  paymentMethod?: PaymentMethod;
  rampType: RampDirection;
  walletAddressLocked?: string;
}

export interface GetWidgetUrlResponse {
  url: string;
}
