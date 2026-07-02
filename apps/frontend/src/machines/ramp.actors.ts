import { QuoteResponse } from "@vortexfi/shared";
import { QuoteService } from "../services/api";
import { AuthAPI } from "../services/api/auth.api";
import { AuthService } from "../services/auth";
import { RampContext, RampMachineEvents } from "./types";

const QUOTE_EXPIRY_THRESHOLD_PERCENTAGE = 60;

export async function refreshQuoteIfNeeded(
  quote: QuoteResponse,
  apiKey: string | undefined,
  partnerId: string | undefined,
  sendBack: (event: RampMachineEvents) => void
): Promise<void> {
  const now = Date.now();
  const expires = new Date(quote.expiresAt).getTime();
  const created = new Date(quote.createdAt || now).getTime();
  const totalDuration = expires - created;
  const timeRemaining = expires - now;

  const percentageRemaining = totalDuration > 0 ? (timeRemaining / totalDuration) * 100 : 0;

  if (percentageRemaining > QUOTE_EXPIRY_THRESHOLD_PERCENTAGE) {
    return;
  }

  try {
    const newQuote = await QuoteService.createQuote(
      quote.rampType,
      quote.from,
      quote.to,
      quote.inputAmount,
      quote.inputCurrency,
      quote.outputCurrency,
      apiKey,
      partnerId
    );
    sendBack({ quote: newQuote, type: "UPDATE_QUOTE" });
  } catch {
    sendBack({ type: "REFRESH_FAILED" });
  }
}

export function redirectToCallbackOrCleanUrl(callbackUrl: string | undefined): void {
  if (callbackUrl) {
    window.location.assign(callbackUrl);
    return;
  }

  window.history.replaceState({}, "", window.location.origin);
}

export async function checkAndRefreshTokenActor() {
  const tokens = AuthService.getTokens();
  if (!tokens) {
    return { success: false, tokens: null };
  }

  try {
    const verifyResult = await AuthAPI.verifyToken(tokens.accessToken);
    if (verifyResult.valid && verifyResult.userId) {
      return {
        success: true,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userEmail: tokens.userEmail,
          userId: verifyResult.userId
        }
      };
    }
  } catch {
    // Fall through to refresh; a failed verify does not necessarily mean the refresh token is invalid.
  }

  try {
    const refreshedTokens = await AuthService.refreshAccessToken();
    if (refreshedTokens) {
      return { success: true, tokens: refreshedTokens };
    }
    // A null result means the refresh token is confirmed invalid: the session is dead.
    AuthService.clearTokens();
    return { success: false, tokens: null };
  } catch {
    // Transient refresh failure (network/5xx): keep the session rather than forcing a
    // logout. Proceed with the current tokens; request-level 401 retry will recover later.
    return { success: true, tokens };
  }
}

export async function loadQuoteActor({ input }: { input: { quoteId: string } }) {
  if (!input.quoteId) {
    throw new Error("Quote ID is required to load quote.");
  }

  const quote = await QuoteService.getQuote(input.quoteId);
  if (!quote) {
    throw new Error(`Quote with ID ${input.quoteId} not found.`);
  }

  return { isExpired: new Date(quote.expiresAt) < new Date(), quote };
}

export async function cleanUrlActor(): Promise<void> {
  window.history.replaceState({}, "", window.location.pathname);
}

export function createQuoteRefresher(
  context: RampContext,
  sendBack: (event: RampMachineEvents) => void
): (() => void) | undefined {
  const { quote, quoteLocked, apiKey, partnerId } = context;
  if (quoteLocked || !quote) {
    return undefined;
  }

  const doRefetch = () => refreshQuoteIfNeeded(quote, apiKey, partnerId, sendBack);

  doRefetch();
  const timer = setInterval(doRefetch, 5000);

  return () => clearInterval(timer);
}
