import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import Partner from "../../models/partner.model";
import { sendError } from "../helpers/sendError";
import { UUID_PATTERN } from "../helpers/uuid";
import {
  buildApiClientRequestMetadata,
  getSafeApiKeyPrefix,
  observeApiClientEvent
} from "../observability/apiClientEvent.service";
import { getRequestDurationMs } from "../observability/requestContext";
import { ApiClientErrorType } from "../observability/types";
import {
  AuthenticatedPartner,
  getKeyType,
  isValidSecretKeyFormat,
  validateApiKey,
  validatePublicApiKey
} from "./apiKeyAuth.helpers";

// Extend Express Request type to include authenticatedPartner
declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      authenticatedPartner?: AuthenticatedPartner;
    }
  }
}

interface ApiKeyAuthOptions {
  required?: boolean; // If true, return 401 if no key provided
  validatePartnerMatch?: boolean; // If true, check partnerId in payload matches auth
}

/**
 * Middleware factory for API key authentication
 *
 * @param options - Configuration options
 * @returns Express middleware function
 */
export function apiKeyAuth(options: ApiKeyAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;

      // No API key provided
      if (!apiKey) {
        if (options.required) {
          recordAuthFailure(req, 401, "auth_missing_api_key");
          return sendError(res, 401, "API_KEY_REQUIRED", "API key is required for this endpoint");
        }
        // Optional auth - continue without partner info
        return next();
      }

      // Validate that it's a secret key format (sk_*)
      const keyType = getKeyType(apiKey);
      if (keyType !== "secret") {
        recordAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
        return sendError(
          res,
          401,
          "INVALID_SECRET_KEY",
          "X-API-Key header must contain a secret key (sk_live_* or sk_test_*). Use X-Public-Key for public credentials."
        );
      }

      if (!isValidSecretKeyFormat(apiKey)) {
        recordAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
        return sendError(
          res,
          401,
          "INVALID_SECRET_KEY_FORMAT",
          "Invalid secret key format. Expected sk_live_* or sk_test_* format."
        );
      }

      // Find and validate API key
      const result = await validateApiKey(apiKey);

      if (!result) {
        recordAuthFailure(req, 401, "auth_invalid_api_key", getSafeApiKeyPrefix(apiKey, ["sk_"]));
        return sendError(res, 401, "INVALID_API_KEY", "The provided API key is invalid or has expired");
      }

      const partner = result.partner;

      let publicCredentialId = req.credential?.strength === "public" ? req.credential.credentialId : undefined;
      if (!publicCredentialId && req.headers["x-public-key"]) {
        const publicResult = await validatePublicApiKey(req.headers["x-public-key"] as string);
        if (!publicResult) {
          recordAuthFailure(req, 401, "auth_invalid_public_key", getSafeApiKeyPrefix(req.headers["x-public-key"] as string));
          return sendError(res, 401, "INVALID_PUBLIC_KEY", "The provided public API key is invalid or expired");
        }
        publicCredentialId = publicResult.credential.credentialId;
      }
      if (publicCredentialId && publicCredentialId !== result.credential.credentialId) {
        return sendError(res, 403, "CREDENTIAL_MISMATCH", "Public and secret credentials do not match");
      }

      req.credential = result.credential;
      req.authenticatedCredentialProfileId = result.credential.profileId;

      // Attach authenticated partner to request (null for user-scoped keys, leaving the field unset).
      if (partner) {
        req.authenticatedPartner = partner;
      }
      // If validatePartnerMatch enabled, check payload partnerId
      if (options.validatePartnerMatch && req.body?.partnerId) {
        const requestedPartner = await resolvePartner(req.body.partnerId);
        if (!requestedPartner) {
          recordAuthFailure(req, 404, "auth_partner_not_found", getSafeApiKeyPrefix(apiKey, ["sk_"]), partner ?? undefined);
          return sendError(res, 404, "PARTNER_NOT_FOUND", "The requested partner was not found");
        }

        if (requestedPartner.id !== req.credential.partnerId) {
          recordAuthFailure(req, 403, "auth_partner_mismatch", getSafeApiKeyPrefix(apiKey, ["sk_"]), partner ?? undefined);
          return sendError(res, 403, "PARTNER_MISMATCH", "The authenticated partner does not match the requested partner");
        }
      }

      next();
    } catch (error) {
      logger.error("API key authentication error:", error);
      next(error);
    }
  };
}

/**
 * Middleware to enforce partner authentication when partnerId is in payload
 * This ensures that if a partnerId is specified, the request must be authenticated
 * and resolve to the credential's canonical partner ID.
 *
 * Supports both UUID (partner ID) and string (partner name) formats.
 */
export function enforcePartnerAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // If partnerId is in the payload
    if (req.body?.partnerId) {
      if (!req.credential?.partnerId) {
        recordAuthFailure(req, 403, "auth_missing_api_key");
        return sendError(res, 403, "AUTHENTICATION_REQUIRED", "Authentication is required when partnerId is specified");
      }

      const requestedPartner = await resolvePartner(req.body.partnerId);
      if (!requestedPartner) {
        recordAuthFailure(req, 404, "auth_partner_not_found", null);
        return sendError(res, 404, "PARTNER_NOT_FOUND", "The requested partner was not found");
      }

      if (requestedPartner.id !== req.credential.partnerId) {
        recordAuthFailure(req, 403, "auth_partner_mismatch", null, req.authenticatedPartner);
        return sendError(res, 403, "PARTNER_MISMATCH", "The authenticated partner does not match the requested partner");
      }
    }

    next();
  };
}

async function resolvePartner(partnerIdOrName: string): Promise<Partner | null> {
  const isUUID = UUID_PATTERN.test(partnerIdOrName);
  return isUUID ? Partner.findByPk(partnerIdOrName) : Partner.findOne({ where: { name: partnerIdOrName } });
}

function recordAuthFailure(
  req: Request,
  httpStatus: number,
  errorType: Extract<
    ApiClientErrorType,
    | "auth_missing_api_key"
    | "auth_invalid_api_key"
    | "auth_invalid_public_key"
    | "auth_partner_not_found"
    | "auth_partner_mismatch"
  >,
  apiKeyPrefix?: string | null,
  partner?: AuthenticatedPartner
): void {
  observeApiClientEvent({
    apiKeyPrefix,
    durationMs: getRequestDurationMs(req),
    errorType,
    httpStatus,
    metadata: buildApiClientRequestMetadata(req, { bodyKeys: ["partnerId"] }),
    operation: "auth_api_key",
    partnerId: partner?.id || req.credential?.partnerId || null,
    partnerName: partner?.name || req.authenticatedPartner?.name || null,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || req.credential?.profileId || null
  });
}
