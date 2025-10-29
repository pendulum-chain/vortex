import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import Partner from "../../models/partner.model";
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
        // Look up the partner by the provided partnerId
        const requestedPartner = await Partner.findByPk(req.body.partnerId);

        if (!requestedPartner) {
          return res.status(404).json({
            error: {
              code: "PARTNER_NOT_FOUND",
              message: "The requested partner was not found",
              status: 404
            }
          });
        }

        // Compare partner names (not IDs) since one API key works for all partners with same name
        if (requestedPartner.name !== partner.name) {
          return res.status(403).json({
            error: {
              code: "PARTNER_MISMATCH",
              details: {
                authenticatedPartnerName: partner.name,
                requestedPartnerName: requestedPartner.name
              },
              message: "The authenticated partner name does not match the requested partner's name",
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
 * and the authenticated partner name must match the requested partner's name.
 */
export function enforcePartnerAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
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

      // Look up the partner by the provided partnerId
      const requestedPartner = await Partner.findByPk(req.body.partnerId);

      if (!requestedPartner) {
        return res.status(404).json({
          error: {
            code: "PARTNER_NOT_FOUND",
            message: "The requested partner was not found",
            status: 404
          }
        });
      }

      // Compare partner names (not IDs) since one API key works for all partners with same name
      if (requestedPartner.name !== req.authenticatedPartner.name) {
        return res.status(403).json({
          error: {
            code: "PARTNER_MISMATCH",
            details: {
              authenticatedPartnerName: req.authenticatedPartner.name,
              requestedPartnerName: requestedPartner.name
            },
            message: "The authenticated partner name does not match the requested partner's name",
            status: 403
          }
        });
      }
    }

    next();
  };
}
