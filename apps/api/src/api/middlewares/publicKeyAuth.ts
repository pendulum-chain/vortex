import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import { getKeyType, isValidApiKeyFormat, validatePublicApiKey } from "./apiKeyAuth.helpers";

// Extend Express Request type to include validated public key
declare global {
  namespace Express {
    interface Request {
      validatedPublicKey?: {
        apiKey: string;
        partnerName: string;
      };
    }
  }
}

/**
 * Middleware to validate public API key (optional)
 * This is for tracking purposes - validates the key exists but doesn't enforce authentication
 *
 * Usage: Include in routes where you want to track which partner is making requests
 */
export function validatePublicKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for apiKey in query params or body
      const apiKey = (req.query.apiKey as string) || req.body?.apiKey;

      // If no API key provided, continue without validation
      if (!apiKey) {
        return next();
      }

      // Validate API key format
      if (!isValidApiKeyFormat(apiKey)) {
        return res.status(400).json({
          error: {
            code: "INVALID_API_KEY_FORMAT",
            message: "Invalid API key format. Expected: pk_live_* or pk_test_*",
            status: 400
          }
        });
      }

      // Check if it's a public key
      const keyType = getKeyType(apiKey);
      if (keyType !== "public") {
        return res.status(400).json({
          error: {
            code: "INVALID_KEY_TYPE",
            message: "Expected a public API key (pk_*). Use X-API-Key header for secret keys.",
            status: 400
          }
        });
      }

      // Validate the public key exists and is active
      const partnerName = await validatePublicApiKey(apiKey);

      if (!partnerName) {
        return res.status(401).json({
          error: {
            code: "INVALID_PUBLIC_KEY",
            message: "The provided public API key is invalid, expired, or inactive",
            status: 401
          }
        });
      }

      // Attach validated public key info to request
      req.validatedPublicKey = {
        apiKey,
        partnerName
      };

      next();
    } catch (error) {
      logger.error("Public key validation error:", error);
      next(error);
    }
  };
}
