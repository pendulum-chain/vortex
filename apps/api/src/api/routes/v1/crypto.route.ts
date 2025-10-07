import { Router } from "express";
import { getPublicKey } from "../../controllers/crypto.controller";

const router = Router();

/**
 * GET /v1/public-key
 * Returns the RSA public key for webhook signature verification
 */
router.get("/", getPublicKey);

export default router;
