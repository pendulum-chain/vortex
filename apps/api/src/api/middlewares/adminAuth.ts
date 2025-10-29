import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";

/**
 * Middleware to authenticate admin requests using Bearer token
 *
 * Usage:
 * - Set ADMIN_SECRET in environment variables
 * - Include header: Authorization: Bearer <ADMIN_SECRET>
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: {
          code: "ADMIN_AUTH_REQUIRED",
          message: "Admin authentication required. Provide Authorization header with Bearer token.",
          status: httpStatus.UNAUTHORIZED
        }
      });
      return;
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: {
          code: "INVALID_AUTH_FORMAT",
          message: "Invalid authorization format. Use: Authorization: Bearer <token>",
          status: httpStatus.UNAUTHORIZED
        }
      });
      return;
    }

    const token = parts[1];

    // Check if admin secret is configured
    if (!config.adminSecret) {
      logger.error("ADMIN_SECRET not configured in environment variables");
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: "ADMIN_AUTH_NOT_CONFIGURED",
          message: "Admin authentication is not properly configured",
          status: httpStatus.INTERNAL_SERVER_ERROR
        }
      });
      return;
    }

    // Validate token against configured secret
    // Using constant-time comparison to prevent timing attacks
    const isValid = safeCompare(token, config.adminSecret);

    if (!isValid) {
      res.status(httpStatus.FORBIDDEN).json({
        error: {
          code: "INVALID_ADMIN_TOKEN",
          message: "Invalid admin token",
          status: httpStatus.FORBIDDEN
        }
      });
      return;
    }

    // Token is valid, proceed to next middleware
    next();
  } catch (error) {
    logger.error("Error in admin authentication:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "ADMIN_AUTH_ERROR",
        message: "An error occurred during admin authentication",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
