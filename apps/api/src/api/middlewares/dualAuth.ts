import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import { sendError } from "../helpers/sendError";
import {
  buildApiClientRequestMetadata,
  getSafeApiKeyPrefix,
  observeApiClientEvent
} from "../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../observability/requestContext";
import { AccessTokenVerificationError } from "../services/auth";
import { getKeyType, isValidSecretKeyFormat, validatePublicApiKey, validateSecretApiKey } from "./apiKeyAuth.helpers";
import { resolveBearerPrincipal } from "./bearerPrincipal";

export { assertQuoteOwnership, assertRampOwnership } from "./ownershipAuth";

/**
 * Dual-track authentication: accepts either a partner secret API key
 * (X-API-Key: sk_*) or a Supabase user Bearer token (Authorization: Bearer ...).
 * Canonical API credential identity is populated on `req.credential`; Supabase
 * identity remains on `req.userId`.
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

/** Requires dual auth to have resolved a concrete profile principal. */
export function requireProfileBoundPrincipal(req: Request, res: Response, next: NextFunction): void {
  if (req.userId || req.authenticatedCredentialProfileId) {
    next();
    return;
  }

  sendError(res, 401, "AUTHENTICATION_REQUIRED", "A profile-bound secret key or Bearer token is required.");
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
          return sendError(
            res,
            401,
            "INVALID_SECRET_KEY",
            "X-API-Key header must contain a valid secret key (sk_live_* or sk_test_*)."
          );
        }

        const result = await validateSecretApiKey(apiKey);
        if (!result) {
          recordDualAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
          return sendError(res, 401, "INVALID_API_KEY", "The provided API key is invalid or has expired.");
        }

        const publicKey = req.headers["x-public-key"] as string | undefined;
        if (publicKey) {
          const publicResult = await validatePublicApiKey(publicKey);
          if (!publicResult) {
            return sendError(res, 401, "INVALID_PUBLIC_KEY", "The provided public API key is invalid or expired.");
          }
          if (publicResult.credential.credentialId !== result.credential.credentialId) {
            return sendError(res, 403, "CREDENTIAL_MISMATCH", "Public and secret credentials do not match");
          }
        }

        if (result.partner) {
          req.authenticatedPartner = result.partner;
        }
        req.credential = result.credential;
        req.authenticatedCredentialProfileId = result.credential.profileId;
        return next();
      }

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        let result: Awaited<ReturnType<typeof resolveBearerPrincipal>>;
        try {
          result = await resolveBearerPrincipal(token);
        } catch (error) {
          if (!(error instanceof AccessTokenVerificationError)) {
            logger.error("Unexpected Supabase access-token verifier failure", error);
            next(error);
            return;
          }
          // Callers distinguish "the provider is briefly unreachable" from "this token is
          // rejected"; only the latter should end their session, so a transient failure keeps
          // the 503 the Supabase-only middleware returns instead of surfacing as a 500.
          const unavailable = error.transient;
          logger.warn("Supabase access-token verification failed", {
            category: unavailable ? "provider_unavailable" : "verification_error",
            error: error.message,
            path: req.path,
            requestId: req.headers["x-request-id"]
          });
          recordDualAuthFailure(req, unavailable ? 503 : 401, unavailable ? "service_unavailable" : "auth_invalid_api_key");
          return sendError(
            res,
            unavailable ? 503 : 401,
            unavailable ? "AUTH_SERVICE_UNAVAILABLE" : "INVALID_BEARER_TOKEN",
            unavailable ? "Authentication service unavailable" : "Authentication failed"
          );
        }
        if (!result.valid) {
          recordDualAuthFailure(req, 401, "auth_invalid_api_key");
          return sendError(res, 401, "INVALID_BEARER_TOKEN", "Invalid or expired Bearer token.");
        }

        req.userId = result.userId;
        req.userEmail = result.userEmail;
        req.impersonation = result.impersonation;
        return next();
      }

      if (!requireCredentials) {
        return next();
      }

      recordDualAuthFailure(req, 401, "auth_missing_api_key");
      return sendError(
        res,
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required: provide either an X-API-Key header (sk_*) or an Authorization: Bearer token."
      );
    } catch (error) {
      logger.error("Dual auth middleware error:", error);
      next(error);
    }
  };
}

function recordDualAuthFailure(
  req: Request,
  httpStatus: number,
  errorType: "auth_missing_api_key" | "auth_invalid_api_key" | "service_unavailable",
  apiKeyPrefix?: string | null
): void {
  observeApiClientEvent({
    apiKeyPrefix,
    durationMs: getRequestDurationMs(req),
    errorType,
    httpStatus,
    metadata: buildApiClientRequestMetadata(req, { bodyKeys: ["partnerId"] }),
    operation: "auth_dual",
    partnerId: req.credential?.partnerId || null,
    partnerName: req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || req.credential?.profileId || null
  });
}
