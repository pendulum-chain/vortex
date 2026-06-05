import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

declare global {
  // biome-ignore lint/style/noNamespace: Express request augmentation follows the existing backend pattern.
  namespace Express {
    interface Request {
      requestId?: string;
      requestStartedAt?: number;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    getSafeRequestId(req.headers["x-request-id"]) || getSafeRequestId(req.headers["x-correlation-id"]) || randomUUID();

  req.requestId = requestId;
  req.requestStartedAt = Date.now();
  res.setHeader("X-Request-ID", requestId);

  next();
}

export function getRequestDurationMs(req: { requestStartedAt?: number }): number | null {
  if (!req.requestStartedAt) return null;
  return Date.now() - req.requestStartedAt;
}

function getSafeRequestId(value: string | string[] | undefined): string | null {
  const requestId = Array.isArray(value) ? value[0] : value;
  if (!requestId || requestId.length > MAX_REQUEST_ID_LENGTH || !SAFE_REQUEST_ID_PATTERN.test(requestId)) return null;
  return requestId;
}
