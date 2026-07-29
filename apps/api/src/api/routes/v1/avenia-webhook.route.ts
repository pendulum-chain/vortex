import { Router } from "express";
import { handleAveniaWebhook } from "../../controllers/avenia-webhook.controller";

const router = Router();

/**
 * POST /v1/webhooks/avenia
 * Inbound KYC/KYB verification events from Avenia. Authenticated by RSA signature,
 * not by API key, so it is mounted without the partner auth middleware.
 */
router.post("/", handleAveniaWebhook);

export default router;
