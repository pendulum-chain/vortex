import { MykoboApiService } from "@vortexfi/shared";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";

// Thrown when a Mykobo fee lookup fails and no display fallback is configured.
// QuoteService maps this to QuoteError.AnchorTemporarilyUnavailable so the failure
// is distinguishable from a generic quote calculation error.
export class MykoboFeeUnavailableError extends Error {
  constructor(
    public readonly kind: "deposit" | "withdraw",
    options?: { cause?: unknown }
  ) {
    super(`Mykobo ${kind} fee lookup unavailable`, options);
    this.name = "MykoboFeeUnavailableError";
  }
}

// Returns the flat Mykobo deposit fee (EUR) for the given value, or the configured
// display fallback if the live lookup fails and the fallback is enabled.
export function resolveMykoboDepositFee(value: string): Promise<string> {
  return resolveFee("deposit", () => MykoboApiService.getInstance().defaultDepositFee(value));
}

// Returns the flat Mykobo withdraw fee (EUR) for the given value, or the configured
// display fallback if the live lookup fails and the fallback is enabled.
export function resolveMykoboWithdrawFee(value: string): Promise<string> {
  return resolveFee("withdraw", () => MykoboApiService.getInstance().defaultWithdrawFee(value));
}

async function resolveFee(kind: "deposit" | "withdraw", lookup: () => Promise<{ total: string }>): Promise<string> {
  try {
    const response = await lookup();
    return response.total;
  } catch (error) {
    const { enabled, depositFee, withdrawFee } = config.mykobo.feeFallback;
    const fallback = kind === "deposit" ? depositFee : withdrawFee;
    if (enabled && fallback !== undefined) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`Mykobo ${kind} fee lookup failed (${reason}); using display fallback fee ${fallback} EUR`);
      return fallback;
    }
    throw new MykoboFeeUnavailableError(kind, { cause: error });
  }
}
