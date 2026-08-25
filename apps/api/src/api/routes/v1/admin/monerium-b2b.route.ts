import { Router } from "express";
import { postMoneriumB2bAccount } from "../../../controllers/admin/moneriumB2b.controller";
import { adminAuth } from "../../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

router.use(adminAuth);

// Maps a Monerium-onboarded corporate to a managed profile and records its
// deployed forwarder as a B2B onramp account. Idempotent.
router.post("/accounts", postMoneriumB2bAccount);

export default router;
