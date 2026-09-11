import { Router } from "express";
import { postPartnerAttributionClaim } from "../../controllers/partnerAttribution.controller";
import { rejectImpersonation } from "../../middlewares/bearerPrincipal";
import { validatePublicKey } from "../../middlewares/publicKeyAuth";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router = Router();

router.post("/claim", requireAuth, rejectImpersonation, validatePublicKey(), postPartnerAttributionClaim);

export default router;
