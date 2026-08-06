import { Request, Response, Router } from "express";
import { getOnboardingStatus, putActiveEntity } from "../../controllers/onboarding.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";
import { authorizeManagedProfile } from "../../middlewares/managedProfileAuth";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

/**
 * GET /v1/onboarding/status
 * Aggregated per-entity provider/KYC onboarding status for the authenticated profile.
 */
router.get(
  "/status",
  requirePartnerOrUserAuth(),
  authorizeManagedProfile(),
  getOnboardingStatus as unknown as (req: Request, res: Response) => void
);
router.put("/active-entity", requireAuth, putActiveEntity as unknown as (req: Request, res: Response) => void);

export default router;
