import { Router } from 'express';
import {
  getAllMaintenanceSchedules,
  getMaintenanceStatus,
  updateScheduleActiveStatus,
} from '../../controllers/maintenance.controller';

const router: Router = Router({ mergeParams: true });

/**
 * GET /api/v1/maintenance/status
 * Get the current maintenance status
 */
router.route('/status').get(getMaintenanceStatus);

/**
 * GET /api/v1/maintenance/schedules
 * Get all maintenance schedules (for debugging/admin purposes)
 */
router.route('/schedules').get(getAllMaintenanceSchedules);

/**
 * PATCH /api/v1/maintenance/schedules/:id/active
 * Update the active status of a maintenance schedule (for testing purposes)
 */
router.route('/schedules/:id/active').patch(updateScheduleActiveStatus);

export default router;
