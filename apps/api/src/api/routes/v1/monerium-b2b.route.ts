import { Router } from "express";
import * as moneriumB2bController from "../../controllers/monerium-b2b.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import {
  authorizeManagedProfile,
  rejectDirectManagedCredential,
  rejectManagedProfileSelection
} from "../../middlewares/managedProfileAuth";

const router = Router();

// Authenticated by HMAC signature over the raw body (no session/API-key auth).
router.post("/webhook", moneriumB2bController.handleWebhook);

// Read surface for the account owner: the partner manager acting via
// X-Managed-Profile-Id, or the child's own credential. Corridor and customer-type
// policy match the B2B onramp scope (EU, business).
const accountAuth = [requirePartnerOrUserAuth(), authorizeManagedProfile({ corridor: "EU", customerType: "business" })];

router.get("/account", ...accountAuth, moneriumB2bController.getMoneriumB2bAccount);
router.get("/deposits", ...accountAuth, moneriumB2bController.listMoneriumB2bDeposits);

// Manager-level: every onramp account of the caller's managed profiles, and the partner's
// registrations of new clients' destinations by Monerium profile ID (manager key only;
// a registration creates a payout destination, so impersonation may not make one).
const managerAuth = [requirePartnerOrUserAuth(), rejectDirectManagedCredential, rejectManagedProfileSelection];
router.get("/accounts", ...managerAuth, moneriumB2bController.listMoneriumB2bAccounts);
router.post("/accounts", ...managerAuth, rejectImpersonation, moneriumB2bController.registerMoneriumB2bAccount);
router.get("/registrations", ...managerAuth, moneriumB2bController.listMoneriumB2bRegistrations);

export default router;
