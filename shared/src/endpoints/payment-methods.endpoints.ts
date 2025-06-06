import { FiatToken } from '../tokens';

export type PaymentMethodType = 'buy' | 'sell';

export enum PaymentMethodTypes {
  BUY = 'buy',
  SELL = 'sell',
}

export enum PaymentMethodName {
  SEPA = 'SEPA',
  PIX = 'PIX',
  CBU = 'CBU',
}

export type PaymentMethod = 'pix' | 'sepa' | 'cbu';

export interface PaymentMethodLimits {
  min: number;
  max: number;
}

export interface PaymentMethodConfig {
  id: PaymentMethod;
  name: PaymentMethodName;
  supportedFiats: FiatToken[];
  limits: PaymentMethodLimits;
}

export interface GetSupportedPaymentMethodsRequest {
  type: PaymentMethodType;
  fiat: FiatToken;
}

export interface GetSupportedPaymentMethodsResponse {
  paymentMethods: PaymentMethodConfig[];
}
