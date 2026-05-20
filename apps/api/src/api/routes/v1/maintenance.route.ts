import { Router } from "express";
import {
  getAllMaintenanceSchedules,
  getMaintenanceStatus,
  updateScheduleActiveStatus
} from "../../controllers/maintenance.controller";
import { adminAuth } from "../../middlewares/adminAuth";

const router: Router = Router({ mergeParams: true });

/**
 * GET /api/v1/maintenance/status
 * Get the current maintenance status
 */
router.route("/status").get(getMaintenanceStatus);

/**
 * GET /api/v1/maintenance/schedules
 * Get all maintenance schedules (for debugging/admin purposes)
 */
router.route("/schedules").get(adminAuth, getAllMaintenanceSchedules);

/**
 * PATCH /api/v1/maintenance/schedules/:id/active
 * Update the active status of a maintenance schedule (admin only)
 */
router.route("/schedules/:id/active").patch(adminAuth, updateScheduleActiveStatus);

export default router;
