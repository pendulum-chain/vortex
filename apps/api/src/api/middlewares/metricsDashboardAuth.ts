import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";

/**
 * Authenticates internal observability dashboard requests with a dedicated bearer token.
 */
export function metricsDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn("Metrics dashboard auth attempt without Authorization header", {
        ip: req.ip,
        path: req.path
      });
      res.status(httpStatus.UNAUTHORIZED).json({
        error: {
          code: "METRICS_DASHBOARD_AUTH_REQUIRED",
          message: "Metrics dashboard authentication required. Provide Authorization header with Bearer token.",
          status: httpStatus.UNAUTHORIZED
        }
      });
      return;
    }

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

    if (!config.metricsDashboardSecret) {
      logger.error("METRICS_DASHBOARD_SECRET not configured in environment variables");
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: "METRICS_DASHBOARD_AUTH_NOT_CONFIGURED",
          message: "Metrics dashboard authentication is not properly configured",
          status: httpStatus.INTERNAL_SERVER_ERROR
        }
      });
      return;
    }

    if (!safeCompare(parts[1], config.metricsDashboardSecret)) {
      logger.warn("Failed metrics dashboard auth attempt", {
        ip: req.ip,
        path: req.path
      });
      res.status(httpStatus.FORBIDDEN).json({
        error: {
          code: "INVALID_METRICS_DASHBOARD_TOKEN",
          message: "Invalid metrics dashboard token",
          status: httpStatus.FORBIDDEN
        }
      });
      return;
    }

    next();
  } catch (error) {
    logger.error("Error in metrics dashboard authentication:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "METRICS_DASHBOARD_AUTH_ERROR",
        message: "An error occurred during metrics dashboard authentication",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

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
