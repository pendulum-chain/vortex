import { NextFunction, Request, Response } from "express";
import logger from "../../config/logger";
import { AccessTokenVerificationError, SupabaseAuthService } from "../services/auth";

declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Middleware to verify Supabase auth token and attach userId to request
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
    req.userEmail = result.email;
    next();
  } catch (error) {
    const unavailable = error instanceof AccessTokenVerificationError && error.transient;
    logVerificationFailure(req, unavailable ? "provider_unavailable" : "verification_error", error);
    return res.status(unavailable ? 503 : 401).json({
      error: unavailable ? "Authentication service unavailable" : "Authentication failed"
    });
  }
}

/**
 * Optional auth - attaches userId if token present
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader === undefined) {
    next();
    return;
  }
  if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  try {
    const result = await SupabaseAuthService.verifyToken(authHeader.substring(7));
    if (!result.valid) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.userId = result.user_id;
    req.userEmail = result.email;
    next();
  } catch (error) {
    const unavailable = error instanceof AccessTokenVerificationError && error.transient;
    logVerificationFailure(req, unavailable ? "provider_unavailable" : "verification_error", error);
    return res.status(unavailable ? 503 : 401).json({
      error: unavailable ? "Authentication service unavailable" : "Authentication failed"
    });
  }
}

function logVerificationFailure(req: Request, category: string, error: unknown): void {
  logger.warn("Supabase access-token verification failed", {
    category,
    error: error instanceof Error ? error.message : String(error),
    path: req.path,
    requestId: req.headers["x-request-id"]
  });
}
