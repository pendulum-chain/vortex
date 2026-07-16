import httpStatus from "http-status";
import Partner from "../../models/partner.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { APIError } from "../errors/api-error";
import { buildApiClientRequestMetadata, observeApiClientEvent } from "../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../observability/requestContext";
import type { AuthenticatedPartner } from "./apiKeyAuth.helpers";
import { getEffectiveUserId } from "./effectiveUser";

interface OwnershipRequest {
  authenticatedPartner?: AuthenticatedPartner;
  apiKeyUserId?: string;
  body?: unknown;
  method?: string;
  params?: unknown;
  path?: string;
  query?: unknown;
  requestId?: string;
  requestStartedAt?: number;
  userId?: string;
}

async function ownsPartnerRecord(authenticatedPartner: AuthenticatedPartner, partnerId: string | null): Promise<boolean> {
  if (!partnerId) {
    return false;
  }

  const quotePartner = await Partner.findByPk(partnerId);
  if (!quotePartner?.isActive) {
    return false;
  }
  return partnerId === authenticatedPartner.id || quotePartner.name === authenticatedPartner.name;
}

/**
 * Verify the authenticated principal owns the ramp identified by req.params.id
 * or req.body.rampId. Partner principals must match the quote's partnerId;
 * user principals must match the ramp state's userId.
 */
export async function assertRampOwnership(req: OwnershipRequest, rampId: string): Promise<void> {
  const ramp = await RampState.findByPk(rampId);
  if (!ramp) {
    recordOwnershipFailure(req, httpStatus.NOT_FOUND, "ramp_not_found", { rampId });
    throw new APIError({ message: "Ramp not found", status: httpStatus.NOT_FOUND });
  }

  if (req.authenticatedPartner) {
    const quote = await QuoteTicket.findByPk(ramp.quoteId);
    if (!quote) {
      recordOwnershipFailure(req, httpStatus.NOT_FOUND, "quote_not_found", { quoteId: ramp.quoteId, rampId });
      throw new APIError({ message: "Associated quote not found", status: httpStatus.NOT_FOUND });
    }
    if (!(await ownsPartnerRecord(req.authenticatedPartner, quote.partnerId))) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId: ramp.quoteId, rampId });
      throw new APIError({
        message: "Authenticated partner does not own this ramp",
        status: httpStatus.FORBIDDEN
      });
    }
    // Enforce user consistency on the underlying
    // quote so one partner key cannot operate on a different linked user's
    // provider-backed ramp.
    if (req.apiKeyUserId && quote.userId && quote.userId !== req.apiKeyUserId) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId: ramp.quoteId, rampId });
      throw new APIError({
        message: "Authenticated API key user does not own this ramp",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  const userId = getEffectiveUserId(req);
  if (userId) {
    // A ramp with `userId === null` is fully anonymous: it carries no privileged owner and is
    // already reachable by unauthenticated callers below, so an authenticated principal driving it
    // is not an escalation. Only reject when the ramp is owned by a *different* user.
    if (ramp.userId !== null && ramp.userId !== userId) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId: ramp.quoteId, rampId });
      throw new APIError({
        message: "Authenticated user does not own this ramp",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  // Anonymous caller: allow only when the ramp itself is fully anonymous
  // (no user owner AND its source quote has no partner owner). Owned ramps
  // always require matching credentials.
  if (ramp.userId === null) {
    const quote = await QuoteTicket.findByPk(ramp.quoteId);
    if (!quote) {
      recordOwnershipFailure(req, httpStatus.NOT_FOUND, "quote_not_found", { quoteId: ramp.quoteId, rampId });
      throw new APIError({ message: "Associated quote not found", status: httpStatus.NOT_FOUND });
    }
    if (quote.partnerId === null) {
      return;
    }
  }

  recordOwnershipFailure(req, httpStatus.UNAUTHORIZED, "ownership_denied", { quoteId: ramp.quoteId, rampId });
  throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
}

/**
 * Ownership check for flows that reference a quote before a ramp exists.
 */
export async function assertQuoteOwnership(req: OwnershipRequest, quoteId: string): Promise<void> {
  const quote = await QuoteTicket.findByPk(quoteId);
  if (!quote) {
    recordOwnershipFailure(req, httpStatus.NOT_FOUND, "quote_not_found", { quoteId });
    throw new APIError({ message: "Quote not found", status: httpStatus.NOT_FOUND });
  }

  if (req.authenticatedPartner) {
    if (!(await ownsPartnerRecord(req.authenticatedPartner, quote.partnerId))) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId });
      throw new APIError({
        message: "Authenticated partner does not own this quote",
        status: httpStatus.FORBIDDEN
      });
    }
    // Enforce user consistency on the quote so one
    // partner key cannot operate on a different linked user's provider-bound
    // quote.
    if (req.apiKeyUserId && quote.userId && quote.userId !== req.apiKeyUserId) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId });
      throw new APIError({
        message: "Authenticated API key user does not own this quote",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  const userId = getEffectiveUserId(req);
  if (userId) {
    if (quote.partnerId !== null) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId });
      throw new APIError({
        message: "This quote belongs to a partner; user authentication is not sufficient",
        status: httpStatus.FORBIDDEN
      });
    }
    if (quote.userId !== null && quote.userId !== userId) {
      recordOwnershipFailure(req, httpStatus.FORBIDDEN, "ownership_denied", { quoteId });
      throw new APIError({
        message: "Authenticated user does not own this quote",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  // Anonymous caller: allow only when the quote is fully anonymous
  // (no partner owner AND no user owner). Owned quotes always require
  // matching credentials.
  if (quote.partnerId === null && quote.userId === null) {
    return;
  }

  recordOwnershipFailure(req, httpStatus.UNAUTHORIZED, "ownership_denied", { quoteId });
  throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
}

function recordOwnershipFailure(
  req: OwnershipRequest,
  status: number,
  errorType: "ownership_denied" | "quote_not_found" | "ramp_not_found",
  context: { quoteId?: string | null; rampId?: string | null }
): void {
  observeApiClientEvent({
    ...context,
    durationMs: getRequestDurationMs(req),
    errorType,
    httpStatus: status,
    metadata: buildApiClientRequestMetadata(req, { bodyKeys: ["quoteId", "rampId"], paramKeys: ["id"] }),
    operation: "auth_ownership",
    partnerId: req.authenticatedPartner?.id || null,
    partnerName: req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "failure",
    userId: getEffectiveUserId(req) || null
  });
}
