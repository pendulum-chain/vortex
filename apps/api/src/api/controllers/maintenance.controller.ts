import { RequestHandler } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { maintenanceService } from "../services/maintenance.service";

/**
 * Get the current maintenance status
 *
 * @route GET /api/v1/maintenance/status
 * @returns {Object} 200 - Maintenance status response
 * @returns {Object} 500 - Internal server error
 */
export const getMaintenanceStatus: RequestHandler = async (_, res) => {
  try {
    const maintenanceStatus = await maintenanceService.getMaintenanceStatus();

    res.status(httpStatus.OK).json(maintenanceStatus);
  } catch (error) {
    logger.error(`Error fetching maintenance status: ${error?.toString()}`, error);

    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error occurred while fetching maintenance status"
    });
  }
};

/**
 * Get all maintenance schedules (for debugging/admin purposes)
 * This endpoint is not part of the original design but useful for testing
 *
 * @route GET /api/v1/maintenance/schedules
 * @returns {Object} 200 - Array of maintenance schedules
 * @returns {Object} 500 - Internal server error
 */
export const getAllMaintenanceSchedules: RequestHandler = async (_, res) => {
  try {
    const schedules = await maintenanceService.getAllSchedules();

    res.status(httpStatus.OK).json({
      schedules,
      count: schedules.length
    });
  } catch (error) {
    logger.error(`Error fetching maintenance schedules: ${error?.toString()}`, error);

    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error occurred while fetching maintenance schedules"
    });
  }
};

/**
 * Update the active status of a maintenance schedule (for testing purposes)
 * This endpoint is not part of the original design but useful for testing
 *
 * @route PATCH /api/v1/maintenance/schedules/:id/active
 * @param {string} id - The maintenance schedule ID
 * @param {boolean} isActive - The new active status
 * @returns {Object} 200 - Success response
 * @returns {Object} 400 - Bad request
 * @returns {Object} 404 - Schedule not found
 * @returns {Object} 500 - Internal server error
 */
export const updateScheduleActiveStatus: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      res.status(httpStatus.BAD_REQUEST).json({
        error: "isActive must be a boolean value"
      });
      return;
    }

    const success = await maintenanceService.updateScheduleActiveStatus(id, isActive);

    if (!success) {
      res.status(httpStatus.NOT_FOUND).json({
        error: "Maintenance schedule not found"
      });
      return;
    }

    res.status(httpStatus.OK).json({
      message: `Maintenance schedule ${id} active status updated to ${isActive}`,
      success: true
    });
  } catch (error) {
    logger.error(`Error updating maintenance schedule active status: ${error?.toString()}`, error);

    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error occurred while updating maintenance schedule"
    });
  }
};
