import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { sendError } from "../helpers/sendError";

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
      sendError(
        res,
        httpStatus.UNAUTHORIZED,
        "METRICS_DASHBOARD_AUTH_REQUIRED",
        "Metrics dashboard authentication required. Provide Authorization header with Bearer token."
      );
      return;
    }

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

    if (!config.metricsDashboardSecret) {
      logger.error("METRICS_DASHBOARD_SECRET not configured in environment variables");
      sendError(
        res,
        httpStatus.INTERNAL_SERVER_ERROR,
        "METRICS_DASHBOARD_AUTH_NOT_CONFIGURED",
        "Metrics dashboard authentication is not properly configured"
      );
      return;
    }

    if (!safeCompare(parts[1], config.metricsDashboardSecret)) {
      logger.warn("Failed metrics dashboard auth attempt", {
        ip: req.ip,
        path: req.path
      });
      sendError(res, httpStatus.FORBIDDEN, "INVALID_METRICS_DASHBOARD_TOKEN", "Invalid metrics dashboard token");
      return;
    }

    next();
  } catch (error) {
    logger.error("Error in metrics dashboard authentication:", error);
    sendError(
      res,
      httpStatus.INTERNAL_SERVER_ERROR,
      "METRICS_DASHBOARD_AUTH_ERROR",
      "An error occurred during metrics dashboard authentication"
    );
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
