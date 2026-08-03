import { RequestHandler, Router } from "express";
import { getLimits } from "../../controllers/limits.controller";
import { requirePartnerOrUserAuth } from "../../middlewares/dualAuth";

const router: Router = Router({ mergeParams: true });

router.post("/", requirePartnerOrUserAuth(), getLimits as unknown as RequestHandler);

export default router;
