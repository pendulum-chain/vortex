import { Router } from "express";
import { listApiClientEvents } from "../../../controllers/admin/apiClientEvents.controller";
import { metricsDashboardAuth } from "../../../middlewares/metricsDashboardAuth";

const router: Router = Router({ mergeParams: true });

router.use(metricsDashboardAuth);

/**
 * GET /v1/admin/api-client-events
 * List sanitized API client observability events for internal dashboards.
 *
 * Authentication: Requires Authorization: Bearer <METRICS_DASHBOARD_SECRET>
 */
router.get("/", listApiClientEvents);

export default router;
