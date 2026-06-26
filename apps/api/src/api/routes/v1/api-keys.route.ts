import { Request, Response, Router } from "express";
import { createUserApiKey, listUserApiKeys, revokeUserApiKey } from "../../controllers/userApiKeys.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);

/**
 * POST /v1/api-keys
 * Create a new public + secret API key pair bound to the authenticated Supabase user.
 */
router.post("/", createUserApiKey as unknown as (req: Request, res: Response) => void);

/**
 * GET /v1/api-keys
 * List the authenticated user's active API keys.
 */
router.get("/", listUserApiKeys as unknown as (req: Request, res: Response) => void);

/**
 * DELETE /v1/api-keys/:keyId
 * Revoke (soft delete) one or both keys of a pair.
 * Body: { publicKeyId?: string } — if provided, both keys of the pair are revoked together.
 * The public+secret keys must be opposite types and share the same base name.
 */
router.delete("/:keyId", revokeUserApiKey as unknown as (req: Request<{ keyId: string }>, res: Response) => void);

export default router;
