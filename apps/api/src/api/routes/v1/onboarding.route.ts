import { Request, Response, Router } from "express";
import { getOnboardingStatus, putActiveEntity } from "../../controllers/onboarding.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);

/**
 * GET /v1/onboarding/status
 * Aggregated per-entity provider/KYC onboarding status for the authenticated profile.
 */
router.get("/status", getOnboardingStatus as unknown as (req: Request, res: Response) => void);
router.put("/active-entity", putActiveEntity as unknown as (req: Request, res: Response) => void);

export default router;
