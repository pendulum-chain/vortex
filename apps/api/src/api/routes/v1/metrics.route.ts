import { Router } from "express";
import { getVolumes } from "../../controllers/metrics.controller";

const router: Router = Router({ mergeParams: true });

/**
 * GET v1/metrics/volumes
 */
router.get("/volumes", getVolumes);

export default router;
