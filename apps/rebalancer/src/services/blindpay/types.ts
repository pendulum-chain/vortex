// Types for the BlindPay API (https://api.blindpay.com/reference).
// We only use the lightweight payin FX-rate endpoint to obtain an indicative
// price for converting fiat (BRL) into a stablecoin, for rate-tracking purposes.

// Fiat currency the sender pays in.
export type BlindpayFiatCurrency = "BRL" | "USD" | "MXN" | "COP" | "ARS";

// Stablecoin the receiver would get out. "USDB" is only available on sandbox/dev instances.
export type BlindpayStablecoin = "USDC" | "USDT" | "USDB";

// Which side of the conversion `request_amount` is denominated in.
// "sender" => request_amount is in the fiat currency (what we want here).
export type BlindpayCurrencyType = "sender" | "receiver";

// POST /instances/{instanceId}/payin-quotes/fx
export interface PayinFxRateInput {
  currency_type: BlindpayCurrencyType;
  from: BlindpayFiatCurrency;
  to: BlindpayStablecoin;
  // Integer amount in cents of the `currency_type` currency. No float values allowed.
  request_amount: number;
}

export interface PayinFxRateResponse {
  // Market/reference quotation.
  commercial_quotation: number;
  // The quotation BlindPay actually applies (includes their spread).
  blindpay_quotation: number;
  // Resulting amount on the other side of the conversion, in cents.
  result_amount: number;
  instance_flat_fee: number;
  instance_percentage_fee: number;
}
