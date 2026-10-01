import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { sendError } from "../helpers/sendError";

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
      logger.warn("Admin auth attempt without Authorization header", {
        ip: req.ip,
        path: req.path
      });
      sendError(
        res,
        httpStatus.UNAUTHORIZED,
        "ADMIN_AUTH_REQUIRED",
        "Admin authentication required. Provide Authorization header with Bearer token."
      );
      return;
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      sendError(
        res,
        httpStatus.UNAUTHORIZED,
        "INVALID_AUTH_FORMAT",
        "Invalid authorization format. Use: Authorization: Bearer <token>"
      );
      return;
    }

    const token = parts[1];

    // Check if admin secret is configured
    if (!config.adminSecret) {
      logger.error("ADMIN_SECRET not configured in environment variables");
      sendError(
        res,
        httpStatus.INTERNAL_SERVER_ERROR,
        "ADMIN_AUTH_NOT_CONFIGURED",
        "Admin authentication is not properly configured"
      );
      return;
    }

    // Validate token against configured secret
    // Using constant-time comparison to prevent timing attacks
    const isValid = safeCompare(token, config.adminSecret);

    if (!isValid) {
      logger.warn("Failed admin auth attempt", {
        ip: req.ip,
        path: req.path
      });
      sendError(res, httpStatus.FORBIDDEN, "INVALID_ADMIN_TOKEN", "Invalid admin token");
      return;
    }

    // Token is valid, proceed to next middleware
    next();
  } catch (error) {
    logger.error("Error in admin authentication:", error);
    sendError(res, httpStatus.INTERNAL_SERVER_ERROR, "ADMIN_AUTH_ERROR", "An error occurred during admin authentication");
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const dummyBuf = Buffer.alloc(bufA.length);
    crypto.timingSafeEqual(bufA, dummyBuf);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
