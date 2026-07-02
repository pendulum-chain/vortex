import { USDC_RATES } from "@/domain/transfer";
import type { CorridorId } from "@/domain/types";
import { CORRIDOR_COUNTRY, CORRIDOR_FIAT, CORRIDOR_LIMITS, CORRIDOR_PAYMENT_METHOD, toWireNetwork } from "./mappers";
import { type CreateQuoteRequest, QuoteError, type QuoteResponse, RampDirection } from "./types";

// Mock network fees in USD, converted to the corridor's fiat via the USDC rate.
const NETWORK_FEE_USD: Record<string, number> = {
  arbitrum: 0.4,
  assethub: 0.2,
  base: 0.3,
  ethereum: 6,
  polygon: 0.3
};

const ANCHOR_FEE_RATE = 0.005; // provider spread
const VORTEX_FEE_RATE = 0.0025; // platform fee
const DISCOUNT_RATE = 0.5; // promo: half off the vortex fee

// Simulated network latency so react-query loading states are visible.
const LATENCY_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function f(n: number): string {
  return n.toFixed(2);
}

export interface OfframpQuoteParams {
  corridorId: CorridorId;
  /** Fiat amount the recipient should receive, in the corridor's currency. */
  payoutAmount: number;
  /** Dashboard transfer-network id the stablecoin leg settles on. */
  network: string;
}

/**
 * Mock of the Vortex offramp (SELL) quote: sender sends USDC, recipient receives fiat.
 *
 * Real swap: replace the body with
 *   const request = buildRequest(params);
 *   return apiClient.post<QuoteResponse>("/quotes", request);
 * The returned shape already matches QuoteResponse, so no downstream changes.
 */
export async function fetchOfframpQuote(params: OfframpQuoteParams): Promise<QuoteResponse> {
  await delay(LATENCY_MS);

  const { corridorId, payoutAmount, network } = params;
  const fiat = CORRIDOR_FIAT[corridorId];
  const rate = USDC_RATES[corridorId];
  const limits = CORRIDOR_LIMITS[corridorId];

  if (payoutAmount < limits.min) {
    throw new Error(`${QuoteError.BelowLowerLimitSell} ${f(limits.min)} ${fiat}`);
  }
  if (payoutAmount > limits.max) {
    throw new Error(`${QuoteError.AboveUpperLimitSell} ${f(limits.max)} ${fiat}`);
  }

  const anchorFeeFiat = payoutAmount * ANCHOR_FEE_RATE;
  const vortexFeeFiat = payoutAmount * VORTEX_FEE_RATE;
  const partnerFeeFiat = 0;
  const networkFeeFiat = (NETWORK_FEE_USD[network] ?? 0.5) * rate;
  const processingFeeFiat = anchorFeeFiat + vortexFeeFiat;
  const totalFeeFiat = networkFeeFiat + anchorFeeFiat + vortexFeeFiat + partnerFeeFiat;
  const discountFiat = vortexFeeFiat * DISCOUNT_RATE;

  // USDC the sender pays in: payout grossed up by net fees, converted at the mid-market rate.
  const inputAmount = (payoutAmount + totalFeeFiat - discountFiat) / rate;

  const toUsd = (fiatValue: number) => f(fiatValue / rate);
  const now = Date.now();

  return {
    alfredpayInputLimits: undefined,
    anchorFeeFiat: f(anchorFeeFiat),
    anchorFeeUsd: toUsd(anchorFeeFiat),
    createdAt: new Date(now).toISOString(),
    discountCurrency: fiat,
    discountFiat: f(discountFiat),
    discountUsd: toUsd(discountFiat),
    expiresAt: new Date(now + 60_000).toISOString(),
    feeCurrency: fiat,
    from: toWireNetwork(network),
    id: `qt_${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    inputAmount: f(inputAmount),
    inputCurrency: "USDC",
    network: toWireNetwork(network),
    networkFeeFiat: f(networkFeeFiat),
    networkFeeUsd: toUsd(networkFeeFiat),
    outputAmount: f(payoutAmount),
    outputCurrency: fiat,
    partnerFeeFiat: f(partnerFeeFiat),
    partnerFeeUsd: toUsd(partnerFeeFiat),
    paymentMethod: CORRIDOR_PAYMENT_METHOD[corridorId],
    processingFeeFiat: f(processingFeeFiat),
    processingFeeUsd: toUsd(processingFeeFiat),
    rampType: RampDirection.SELL,
    to: CORRIDOR_PAYMENT_METHOD[corridorId],
    totalFeeFiat: f(totalFeeFiat),
    totalFeeUsd: toUsd(totalFeeFiat),
    vortexFeeFiat: f(vortexFeeFiat),
    vortexFeeUsd: toUsd(vortexFeeFiat)
  };
}

/** The wire request the mock stands in for — kept so the real swap is mechanical. */
export function buildOfframpQuoteRequest(params: OfframpQuoteParams, inputAmount: string): CreateQuoteRequest {
  const { corridorId, network } = params;
  return {
    countryCode: CORRIDOR_COUNTRY[corridorId],
    from: toWireNetwork(network),
    inputAmount,
    inputCurrency: "USDC",
    network: toWireNetwork(network),
    outputCurrency: CORRIDOR_FIAT[corridorId],
    paymentMethod: CORRIDOR_PAYMENT_METHOD[corridorId],
    rampType: RampDirection.SELL,
    to: CORRIDOR_PAYMENT_METHOD[corridorId]
  };
}
