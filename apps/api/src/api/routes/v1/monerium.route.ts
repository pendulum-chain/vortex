import { Router } from "express";
import * as moneriumController from "../../controllers/monerium.controller";
import { requireAuth } from "../../middlewares/supabaseAuth";

const router: Router = Router({ mergeParams: true });

router.use(requireAuth);
router.post("/oauth/start", moneriumController.start);
router.post("/oauth/complete", moneriumController.complete);
router.get("/status", moneriumController.status);

export default router;
