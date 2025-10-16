import { CreateQuoteRequest } from "./quote.endpoints";

export interface GetWidgetUrlLocked {
  quoteId: string;
  externalSessionId: string;
  walletAddressLocked?: string;
  externalTransactionId?: string;
  externalCustomerId?: string;
}

export interface GetWidgetUrlRefresh extends CreateQuoteRequest {
  externalSessionId: string;
  walletAddressLocked?: string;
  externalTransactionId?: string;
  externalCustomerId?: string;
}

export interface GetWidgetUrlResponse {
  url: string;
}
