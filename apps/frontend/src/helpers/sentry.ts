import type { ErrorEvent, EventHint } from "@sentry/react";
import { type DomainError, isApiError } from "../services/api/api-client";

// Expected, unactionable noise we never want to report: wallet user-rejections,
// browser-extension internals, benign ResizeObserver warnings, and cancelled requests.
// Note: TimeoutError is intentionally NOT ignored — a request timeout can signal a slow backend.
export const SENTRY_IGNORE_ERRORS: (string | RegExp)[] = [
  "User rejected the request",
  "User denied",
  "User rejected",
  "Rejected by user",
  /ResizeObserver loop completed/,
  /ResizeObserver loop limit exceeded/,
  "Extension context invalidated",
  "AbortError",
  "The user aborted a request"
];

// Drop events whose top frame comes from a browser-extension injected script.
export const SENTRY_DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-extension:\/\//,
  /^chrome:\/\//
];

// Query strings can carry PII (session ids, tax ids, wallet addresses, callback urls).
// The path alone is enough for debugging, so redact everything after "?".
function stripQueryString(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?[Filtered]`;
}

// Client errors that are user-driven or expected (auth, rate-limit, not-found) rather than bugs.
// 400/422 are kept — they usually mean we sent a bad request, which is worth reporting.
const EXPECTED_CLIENT_STATUSES = new Set([401, 403, 404, 409, 429]);

function hasDomain(error: unknown): error is DomainError {
  return typeof error === "object" && error !== null && typeof (error as DomainError).domain === "string";
}

// Tag events by business domain (when the originating error carries one), drop expected
// client errors, and strip PII from URLs before the event leaves the browser.
export function sentryBeforeSend(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const original = hint?.originalException;

  // Don't report expected client errors (auth/rate-limit/not-found) — user-driven, not bugs.
  if (isApiError(original) && EXPECTED_CLIENT_STATUSES.has(original.status)) {
    return null;
  }

  if (hasDomain(original)) {
    event.tags = { ...event.tags, domain: original.domain };
  }

  if (event.request?.url) {
    event.request.url = stripQueryString(event.request.url);
  }
  if (event.request?.query_string) {
    event.request.query_string = "[Filtered]";
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(breadcrumb =>
      typeof breadcrumb.data?.url === "string"
        ? { ...breadcrumb, data: { ...breadcrumb.data, url: stripQueryString(breadcrumb.data.url) } }
        : breadcrumb
    );
  }

  return event;
}
