import { Router } from "express";
import * as moneriumB2bController from "../../controllers/monerium-b2b.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile } from "../../middlewares/managedProfileAuth";

const router = Router();

// Authenticated by HMAC signature over the raw body (no session/API-key auth).
router.post("/webhook", moneriumB2bController.handleWebhook);

// Read surface for the account owner: the partner manager acting via
// X-Managed-Profile-Id, or the child's own credential. Corridor and customer-type
// policy match the B2B onramp scope (EU, business).
const accountAuth = [requirePartnerOrUserAuth(), authorizeManagedProfile({ corridor: "EU", customerType: "business" })];

router.get("/account", ...accountAuth, moneriumB2bController.getMoneriumB2bAccount);
router.get("/deposits", ...accountAuth, moneriumB2bController.listMoneriumB2bDeposits);

export default router;
