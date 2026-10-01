import { config } from "../../config/vars";
import { bearerSecretAuth } from "./bearerSecretAuth";

/**
 * Middleware to authenticate admin requests using Bearer token
 *
 * Usage:
 * - Set ADMIN_SECRET in environment variables
 * - Include header: Authorization: Bearer <ADMIN_SECRET>
 */
export const adminAuth = bearerSecretAuth({
  codes: {
    error: "ADMIN_AUTH_ERROR",
    invalidToken: "INVALID_ADMIN_TOKEN",
    notConfigured: "ADMIN_AUTH_NOT_CONFIGURED",
    required: "ADMIN_AUTH_REQUIRED"
  },
  envName: "ADMIN_SECRET",
  getSecret: () => config.adminSecret,
  label: "Admin"
});
