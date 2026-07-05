import { EPaymentMethod, Networks, QuoteResponse, RampCurrency, RampDirection, RampPhase, RampProcess } from "@vortexfi/shared";

export function buildQuoteResponse(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  return {
    anchorFeeFiat: "0.5",
    anchorFeeUsd: "0.1",
    createdAt: new Date("2026-07-05T10:00:00Z"),
    expiresAt: new Date("2026-07-05T10:10:00Z"),
    feeCurrency: "BRL" as RampCurrency,
    from: EPaymentMethod.PIX,
    id: "quote-1",
    inputAmount: "150",
    inputCurrency: "BRL" as RampCurrency,
    network: Networks.Base,
    networkFeeFiat: "0.2",
    networkFeeUsd: "0.04",
    outputAmount: "25.5",
    outputCurrency: "USDC" as RampCurrency,
    partnerFeeFiat: "0",
    partnerFeeUsd: "0",
    paymentMethod: EPaymentMethod.PIX,
    processingFeeFiat: "0.5",
    processingFeeUsd: "0.1",
    rampType: RampDirection.BUY,
    to: Networks.Base,
    totalFeeFiat: "0.7",
    totalFeeUsd: "0.14",
    vortexFeeFiat: "0",
    vortexFeeUsd: "0",
    ...overrides
  };
}

export function buildRampProcess(currentPhase: RampPhase, overrides: Partial<RampProcess> = {}): RampProcess {
  return {
    createdAt: new Date().toISOString(),
    currentPhase,
    from: EPaymentMethod.PIX,
    id: "ramp-123",
    inputAmount: "150",
    inputCurrency: "BRL",
    outputAmount: "25.5",
    outputCurrency: "USDC",
    paymentMethod: EPaymentMethod.PIX,
    quoteId: "quote-1",
    to: Networks.Base,
    type: RampDirection.BUY,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}
