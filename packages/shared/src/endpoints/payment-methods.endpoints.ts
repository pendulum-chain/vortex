import { FiatToken } from "../tokens";

export type PaymentMethodType = "buy" | "sell";

export enum PaymentMethodTypes {
  BUY = "buy",
  SELL = "sell"
}

export enum PaymentMethodName {
  SEPA = "SEPA",
  PIX = "PIX",
  CBU = "CBU"
}

export enum EPaymentMethod {
  PIX = "pix",
  SEPA = "sepa",
  CBU = "cbu"
}

export type PaymentMethod = EPaymentMethod;

export interface PaymentMethodLimits {
  min: number;
  max: number;
}

export interface PaymentMethodConfigFiatToken {
  id: FiatToken;
  name: string;
  limits: PaymentMethodLimits;
}

export interface PaymentMethodConfig {
  id: PaymentMethod;
  name: PaymentMethodName;
  supportedFiats: PaymentMethodConfigFiatToken[];
}

export interface GetSupportedPaymentMethodsRequest {
  type: PaymentMethodType;
  fiat: FiatToken;
}

export interface GetSupportedPaymentMethodsResponse {
  paymentMethods: PaymentMethodConfig[];
}
