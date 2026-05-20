import { Request } from "express";
import httpStatus from "http-status";
import Partner from "../../models/partner.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { APIError } from "../errors/api-error";
import type { AuthenticatedPartner } from "./apiKeyAuth.helpers";

async function ownsPartnerRecord(authenticatedPartner: AuthenticatedPartner, partnerId: string | null): Promise<boolean> {
  if (!partnerId) {
    return false;
  }
  if (partnerId === authenticatedPartner.id) {
    return true;
  }

  const quotePartner = await Partner.findByPk(partnerId);
  return quotePartner?.name === authenticatedPartner.name;
}

/**
 * Verify the authenticated principal owns the ramp identified by req.params.id
 * or req.body.rampId. Partner principals must match the quote's partnerId;
 * user principals must match the ramp state's userId.
 */
export async function assertRampOwnership(
  req: Pick<Request, "authenticatedPartner" | "userId">,
  rampId: string
): Promise<void> {
  const ramp = await RampState.findByPk(rampId);
  if (!ramp) {
    throw new APIError({ message: "Ramp not found", status: httpStatus.NOT_FOUND });
  }

  if (req.authenticatedPartner) {
    const quote = await QuoteTicket.findByPk(ramp.quoteId);
    if (!quote) {
      throw new APIError({ message: "Associated quote not found", status: httpStatus.NOT_FOUND });
    }
    if (!(await ownsPartnerRecord(req.authenticatedPartner, quote.partnerId))) {
      throw new APIError({
        message: "Authenticated partner does not own this ramp",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  if (req.userId) {
    if (ramp.userId !== req.userId) {
      throw new APIError({
        message: "Authenticated user does not own this ramp",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
}

/**
 * Ownership check for flows that reference a quote before a ramp exists.
 */
export async function assertQuoteOwnership(
  req: Pick<Request, "authenticatedPartner" | "userId">,
  quoteId: string
): Promise<void> {
  const quote = await QuoteTicket.findByPk(quoteId);
  if (!quote) {
    throw new APIError({ message: "Quote not found", status: httpStatus.NOT_FOUND });
  }

  if (req.authenticatedPartner) {
    if (!(await ownsPartnerRecord(req.authenticatedPartner, quote.partnerId))) {
      throw new APIError({
        message: "Authenticated partner does not own this quote",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  if (req.userId) {
    if (quote.partnerId !== null) {
      throw new APIError({
        message: "This quote belongs to a partner; user authentication is not sufficient",
        status: httpStatus.FORBIDDEN
      });
    }
    if (quote.userId !== null && quote.userId !== req.userId) {
      throw new APIError({
        message: "Authenticated user does not own this quote",
        status: httpStatus.FORBIDDEN
      });
    }
    return;
  }

  throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
}
