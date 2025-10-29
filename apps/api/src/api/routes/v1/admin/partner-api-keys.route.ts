import { Router } from "express";
import { createApiKey, listApiKeys, revokeApiKey } from "../../../controllers/admin/partnerApiKeys.controller";

const router: Router = Router({ mergeParams: true });

/**
 * POST /v1/admin/partners/:partnerId/api-keys
 * Create a new API key for a partner
 *
 * Request body:
 * {
 *   "name": "Production API Key",  // optional
 *   "expiresAt": "2025-12-31T23:59:59Z"  // optional
 * }
 */
router.post("/", createApiKey);

/**
 * GET /v1/admin/partners/:partnerId/api-keys
 * List all API keys for a partner
 */
router.get("/", listApiKeys);

/**
 * DELETE /v1/admin/partners/:partnerId/api-keys/:keyId
 * Revoke (soft delete) an API key
 */
router.delete("/:keyId", revokeApiKey);

export default router;
