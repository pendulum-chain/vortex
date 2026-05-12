import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import { APIError } from "../errors/api-error";
import { SupabaseAuthService } from "../services/auth";
import { getKeyType, isValidSecretKeyFormat, validateSecretApiKey } from "./apiKeyAuth.helpers";

/**
 * Dual-track authentication: accepts either a partner secret API key
 * (X-API-Key: sk_*) or a Supabase user Bearer token (Authorization: Bearer ...).
 * Exactly one of req.authenticatedPartner or req.userId is populated on success.
 */
export function requirePartnerOrUserAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers["x-api-key"] as string | undefined;
      const authHeader = req.headers.authorization;

      if (apiKey) {
        const keyType = getKeyType(apiKey);
        if (keyType !== "secret" || !isValidSecretKeyFormat(apiKey)) {
          return res.status(401).json({
            error: {
              code: "INVALID_SECRET_KEY",
              message: "X-API-Key header must contain a valid secret key (sk_live_* or sk_test_*).",
              status: 401
            }
          });
        }

        const partner = await validateSecretApiKey(apiKey);
        if (!partner) {
          return res.status(401).json({
            error: {
              code: "INVALID_API_KEY",
              message: "The provided API key is invalid or has expired.",
              status: 401
            }
          });
        }

        req.authenticatedPartner = partner;
        return next();
      }

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const result = await SupabaseAuthService.verifyToken(token);
        if (!result.valid) {
          return res.status(401).json({
            error: {
              code: "INVALID_BEARER_TOKEN",
              message: "Invalid or expired Bearer token.",
              status: 401
            }
          });
        }

        req.userId = result.user_id;
        req.userEmail = result.email;
        return next();
      }

      return res.status(401).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required: provide either an X-API-Key header (sk_*) or an Authorization: Bearer token.",
          status: 401
        }
      });
    } catch (error) {
      logger.error("Dual auth middleware error:", error);
      next(error);
    }
  };
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
    if (quote.partnerId !== req.authenticatedPartner.id) {
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
 * Ownership check for the register flow, which references a quote (not yet a ramp).
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
    if (quote.partnerId !== req.authenticatedPartner.id) {
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
    return;
  }

  throw new APIError({ message: "Authentication required", status: httpStatus.UNAUTHORIZED });
}
