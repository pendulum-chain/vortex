import * as Sentry from "@sentry/react";
import { createMoneriumKycApi, createMoneriumKycMachine } from "@vortexfi/kyc";
import { apiClient } from "../services/api";

export const moneriumKycApi = createMoneriumKycApi(apiClient);

/**
 * Top-level navigation keeps the OAuth round trip in one tab; the ramp state is persisted and
 * restored on return. An embedded widget cannot leave the host page, so it opens a tab instead
 * and re-checks the status when the user comes back.
 */
export function openMoneriumAuthorization(url: string): void {
  if (typeof window === "undefined") return;
  if (window.self !== window.top) {
    window.open(url, "_blank", "noopener");
    return;
  }
  window.location.assign(url);
}

export const moneriumKycMachine = createMoneriumKycMachine({
  api: moneriumKycApi,
  client: "widget",
  openAuthorizationUrl: openMoneriumAuthorization,
  reportError: error => Sentry.captureException(error)
});
