import { FiatToken, Networks, OnChainToken, PaymentMethod, RampDirection } from "@packages/shared";

export interface GetWidgetUrlLocked {
  quoteId: string;
  callbackUrl?: string;
  externalSessionId: string;
  externalTransactionId?: string;
  externalCustomerId?: string;
  walletAddressLocked?: string;
}

export interface GetWidgetUrlRefresh {
  callbackUrl?: string;
  countryCode?: string;
  crypto?: OnChainToken;
  cryptoLocked?: OnChainToken;
  externalCustomerId?: string;
  externalSessionId: string;
  externalTransactionId?: string;
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
