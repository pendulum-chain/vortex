import { Router } from "express";
import { createApiKey, listApiKeys, revokeApiKey } from "../../../controllers/admin/partnerApiKeys.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * POST /v1/admin/partners/:partnerName/api-keys
 * Create a new API key for a partner (by name)
 *
 * This will create a key that works for ALL partner records with the same name
 * (e.g., both BUY and SELL configurations)
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 *
 * Request body:
 * {
 *   "name": "Production API Key",  // optional
 *   "expiresAt": "2025-12-31T23:59:59Z"  // optional
 * }
 */
router.post("/", createApiKey);

/**
 * GET /v1/admin/partners/:partnerName/api-keys
 * List all API keys for a partner (by name)
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 */
router.get("/", listApiKeys);

/**
 * DELETE /v1/admin/partners/:partnerName/api-keys/:keyId
 * Revoke (soft delete) an API key
 *
 * Authentication: Requires Authorization: Bearer <ADMIN_SECRET>
 */
router.delete("/:keyId", revokeApiKey);

export default router;
