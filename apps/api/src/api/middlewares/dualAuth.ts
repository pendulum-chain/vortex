import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import {
  buildApiClientRequestMetadata,
  getSafeApiKeyPrefix,
  observeApiClientEvent
} from "../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../observability/requestContext";
import { SupabaseAuthService } from "../services/auth";
import { getKeyType, isValidSecretKeyFormat, validateSecretApiKey } from "./apiKeyAuth.helpers";

export { assertQuoteOwnership, assertRampOwnership } from "./ownershipAuth";

/**
 * Dual-track authentication: accepts either a partner secret API key
 * (X-API-Key: sk_*) or a Supabase user Bearer token (Authorization: Bearer ...).
 * Exactly one of req.authenticatedPartner or req.userId is populated on success.
 */
export function requirePartnerOrUserAuth() {
  return dualAuthHandler({ requireCredentials: true });
}

/**
 * Dual-track authentication that does not reject anonymous callers.
 * If credentials are provided, they MUST be valid (same checks as
 * `requirePartnerOrUserAuth`). If no credentials are provided, the request
 * proceeds and downstream ownership checks decide whether the resource is
 * accessible. Use only on endpoints where anonymous access is intentionally
 * allowed for fully-anonymous resources (no userId, no partnerId).
 */
export function optionalPartnerOrUserAuth() {
  return dualAuthHandler({ requireCredentials: false });
}

function dualAuthHandler({ requireCredentials }: { requireCredentials: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers["x-api-key"] as string | undefined;
      const authHeader = req.headers.authorization;

      if (apiKey) {
        const keyType = getKeyType(apiKey);
        if (keyType !== "secret" || !isValidSecretKeyFormat(apiKey)) {
          recordDualAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
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
          recordDualAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
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
          recordDualAuthFailure(req, 401, "auth_invalid_api_key");
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

      if (!requireCredentials) {
        return next();
      }

      recordDualAuthFailure(req, 401, "auth_missing_api_key");
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

function recordDualAuthFailure(
  req: Request,
  httpStatus: number,
  errorType: "auth_missing_api_key" | "auth_invalid_api_key",
  apiKeyPrefix?: string | null
): void {
  observeApiClientEvent({
    apiKeyPrefix,
    durationMs: getRequestDurationMs(req),
    errorType,
    httpStatus,
    metadata: buildApiClientRequestMetadata(req, { bodyKeys: ["partnerId"] }),
    operation: "auth_dual",
    partnerId: req.authenticatedPartner?.id || null,
    partnerName: req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || null
  });
}
