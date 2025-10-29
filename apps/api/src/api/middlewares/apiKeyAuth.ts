import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import { AuthenticatedPartner, isValidApiKeyFormat, validateApiKey } from "./apiKeyAuth.helpers";

// Extend Express Request type to include authenticatedPartner
declare global {
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
          return res.status(401).json({
            error: {
              code: "API_KEY_REQUIRED",
              message: "API key is required for this endpoint",
              status: 401
            }
          });
        }
        // Optional auth - continue without partner info
        return next();
      }

      // Validate API key format
      if (!isValidApiKeyFormat(apiKey)) {
        return res.status(401).json({
          error: {
            code: "INVALID_API_KEY_FORMAT",
            message: "Invalid API key format",
            status: 401
          }
        });
      }

      // Find and validate API key
      const partner = await validateApiKey(apiKey);

      if (!partner) {
        return res.status(401).json({
          error: {
            code: "INVALID_API_KEY",
            message: "The provided API key is invalid or has expired",
            status: 401
          }
        });
      }

      // Attach authenticated partner to request
      req.authenticatedPartner = partner;

      // If validatePartnerMatch enabled, check payload partnerId
      if (options.validatePartnerMatch && req.body?.partnerId) {
        if (req.body.partnerId !== partner.id) {
          return res.status(403).json({
            error: {
              code: "PARTNER_MISMATCH",
              details: {
                authenticatedPartnerId: partner.id,
                requestedPartnerId: req.body.partnerId
              },
              message: "The authenticated partner does not match the partnerId in the request",
              status: 403
            }
          });
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
 * and the authenticated partner must match the partnerId in the payload.
 */
export function enforcePartnerAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    // If partnerId is in the payload
    if (req.body?.partnerId) {
      // Partner must be authenticated
      if (!req.authenticatedPartner) {
        return res.status(403).json({
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication is required when partnerId is specified",
            status: 403
          }
        });
      }

      // Authenticated partner must match payload partnerId
      if (req.authenticatedPartner.id !== req.body.partnerId) {
        return res.status(403).json({
          error: {
            code: "PARTNER_MISMATCH",
            details: {
              authenticatedPartnerId: req.authenticatedPartner.id,
              requestedPartnerId: req.body.partnerId
            },
            message: "The authenticated partner does not match the partnerId in the request",
            status: 403
          }
        });
      }
    }

    next();
  };
}
