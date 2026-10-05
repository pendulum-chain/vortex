import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { constantTimeEquals } from "../helpers/constantTimeEquals";
import { sendError } from "../helpers/sendError";

interface BearerSecretAuthOptions {
  /** Capitalised subject used in log lines and error messages, e.g. "Admin" or "Metrics dashboard". */
  label: string;
  /** Environment variable holding the secret, named in the "not configured" log line. */
  envName: string;
  /** Read on every request, so the secret is never captured at module load. */
  getSecret: () => string;
  /** Error codes returned for this middleware's own failures. */
  codes: { required: string; notConfigured: string; invalidToken: string; error: string };
}

/**
 * Middleware factory: authenticates `Authorization: Bearer <secret>` against a single shared secret using a
 * constant-time comparison. Missing header -> 401, malformed header -> 401, secret not configured -> 500,
 * wrong token -> 403.
 */
export function bearerSecretAuth({ label, envName, getSecret, codes }: BearerSecretAuthOptions) {
  const name = label.toLowerCase();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        logger.warn(`${label} auth attempt without Authorization header`, {
          ip: req.ip,
          path: req.path
        });
        sendError(
          res,
          httpStatus.UNAUTHORIZED,
          codes.required,
          `${label} authentication required. Provide Authorization header with Bearer token.`
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

      const secret = getSecret();
      if (!secret) {
        logger.error(`${envName} not configured in environment variables`);
        sendError(
          res,
          httpStatus.INTERNAL_SERVER_ERROR,
          codes.notConfigured,
          `${label} authentication is not properly configured`
        );
        return;
      }

      if (!constantTimeEquals(Buffer.from(parts[1]), Buffer.from(secret))) {
        logger.warn(`Failed ${name} auth attempt`, {
          ip: req.ip,
          path: req.path
        });
        sendError(res, httpStatus.FORBIDDEN, codes.invalidToken, `Invalid ${name} token`);
        return;
      }

      next();
    } catch (error) {
      logger.error(`Error in ${name} authentication:`, error);
      sendError(res, httpStatus.INTERNAL_SERVER_ERROR, codes.error, `An error occurred during ${name} authentication`);
    }
  };
}
