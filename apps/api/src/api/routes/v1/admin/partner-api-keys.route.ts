import { Router } from "express";
import { createApiKey, listApiKeys, revokeApiKey } from "../../../controllers/admin/partnerApiKeys.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * POST /v1/admin/partners/:partnerName/api-credentials
 * Create one partner-managed API credential (public + secret value) for an
 * existing profile subject. The partner is addressed by its unique name and
 * bound to the credential by its immutable ID.
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 *
 * Request body:
 * {
 *   "userId": "profile-uuid",            // required subject profile
 *   "name": "Production API Key",        // optional
 *   "expiresAt": "2025-12-31T23:59:59Z"  // optional
 * }
 */
router.post("/", createApiKey);

/**
 * GET /v1/admin/partners/:partnerName/api-credentials
 * List the partner-managed credentials issued for one profile subject (`?userId=`)
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 */
router.get("/", listApiKeys);

/**
 * DELETE /v1/admin/partners/:partnerName/api-credentials/:credentialId
 * Revoke one credential by immutable ID, disabling both values atomically
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 */
router.delete("/:credentialId", revokeApiKey);

export default router;
