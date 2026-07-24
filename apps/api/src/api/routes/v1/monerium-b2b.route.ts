import { Router } from "express";
import * as moneriumB2bController from "../../controllers/monerium-b2b.controller";

const router = Router();

// Authenticated by HMAC signature over the raw body (no session/API-key auth).
router.post("/webhook", moneriumB2bController.handleWebhook);

export default router;
