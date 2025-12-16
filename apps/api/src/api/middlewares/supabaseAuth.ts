import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import { SupabaseAuthService } from "../services/auth";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Middleware to verify Supabase auth token
 * Ready for future use when endpoints need protection
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid authorization header"
      });
    }

    const token = authHeader.substring(7);
    const result = await SupabaseAuthService.verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        error: "Invalid or expired token"
      });
    }

    req.userId = result.user_id;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      error: "Authentication failed"
    });
  }
}

/**
 * Optional auth - attaches userId if token present
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const result = await SupabaseAuthService.verifyToken(token);

      if (result.valid) {
        req.userId = result.user_id;
      }
    }

    next();
  } catch (error) {
    // Log truncated token for security - only show first/last few characters
    const authHeader = req.headers.authorization;
    const truncatedAuth = authHeader
      ? `${authHeader.substring(0, 15)}...${authHeader.substring(authHeader.length - 4)}`
      : undefined;

    logger.warn("optionalAuth middleware: authentication error", {
      authorization: truncatedAuth,
      error,
      path: req.path
    });
    next();
  }
}
