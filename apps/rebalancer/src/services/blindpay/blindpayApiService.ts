import { getConfig } from "../../utils/config.ts";
import type { PayinFxRateInput, PayinFxRateResponse } from "./types.ts";

// A stalled BlindPay request must not hang the surrounding Promise.allSettled and
// stall the whole rebalance run — the quote is observational only.
const REQUEST_TIMEOUT_MS = 30_000;

/// Minimal client for the BlindPay API. Uses a static Bearer API key (no login flow).
/// We only need the payin FX-rate endpoint to obtain an indicative fiat -> stablecoin
/// price, used purely as an observational comparison against the executed routes.
export class BlindpayApiService {
  private static instance: BlindpayApiService;

  private constructor() {}

  public static getInstance(): BlindpayApiService {
    if (!BlindpayApiService.instance) {
      BlindpayApiService.instance = new BlindpayApiService();
    }
    return BlindpayApiService.instance;
  }

  /// Whether BlindPay is configured. When false, callers should skip gracefully.
  public static isConfigured(): boolean {
    const { blindpayApiKey, blindpayInstanceId } = getConfig();
    return Boolean(blindpayApiKey && blindpayInstanceId);
  }

  /// Returns an indicative payin quote (fiat -> stablecoin) without creating a receiver
  /// or blockchain wallet. See POST /instances/{instanceId}/payin-quotes/fx.
  public async getPayinFxRate(input: PayinFxRateInput): Promise<PayinFxRateResponse> {
    const { blindpayApiKey, blindpayBaseUrl, blindpayInstanceId } = getConfig();
    if (!blindpayApiKey || !blindpayInstanceId) {
      throw new Error("BlindPay is not configured (BLINDPAY_API_KEY / BLINDPAY_INSTANCE_ID missing).");
    }

    const url = `${blindpayBaseUrl}/instances/${blindpayInstanceId}/payin-quotes/fx`;

    console.log(`BlindPay API Request: POST ${url}`, input);

    const response = await fetch(url, {
      body: JSON.stringify(input),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${blindpayApiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`BlindPay request failed with status '${response.status}'. Error: ${await response.text()}`);
    }

    return (await response.json()) as PayinFxRateResponse;
  }
}
