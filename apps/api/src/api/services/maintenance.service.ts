import { Op } from "sequelize";
import logger from "../../config/logger";
import MaintenanceSchedule from "../../models/maintenanceSchedule.model";

// Interface for the API response
interface MaintenanceStatusResponse {
  is_maintenance_active: boolean;
  maintenance_details: {
    title: string;
    start_datetime: string;
    end_datetime: string;
    message: string;
    estimated_time_remaining_seconds: number;
  } | null;
}

/**
 * MaintenanceService
 *
 * A service that manages maintenance schedules and provides the current maintenance status.
 * This implementation uses the database table `maintenance_schedules` via Sequelize ORM.
 */
export class MaintenanceService {
  private static instance: MaintenanceService;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    logger.info("MaintenanceService initialized with database integration");
  }

  /**
   * Get the singleton instance of MaintenanceService
   */
  public static getInstance(): MaintenanceService {
    if (!MaintenanceService.instance) {
      MaintenanceService.instance = new MaintenanceService();
    }
    return MaintenanceService.instance;
  }

  /**
   * Get all maintenance schedules (for debugging/admin purposes)
   */
  public async getAllSchedules(): Promise<MaintenanceSchedule[]> {
    try {
      const schedules = await MaintenanceSchedule.findAll({
        order: [["createdAt", "DESC"]]
      });
      return schedules;
    } catch (error) {
      logger.error("Error fetching all maintenance schedules:", error);
      throw new Error("Failed to retrieve maintenance schedules");
    }
  }

  /**
   * Update the active status of a maintenance schedule
   */
  public async updateScheduleActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    try {
      const [updatedRowsCount] = await MaintenanceSchedule.update({ isActiveConfig: isActive }, { where: { id } });

      if (updatedRowsCount === 0) {
        logger.warn(`Maintenance schedule not found: ${id}`);
        return false;
      }

      logger.info(`Updated maintenance schedule ${id} active status to: ${isActive}`);
      return true;
    } catch (error) {
      logger.error("Error updating maintenance schedule active status:", error);
      throw new Error("Failed to update maintenance schedule");
    }
  }

  /**
   * Get the current maintenance status
   *
   * This method implements the core logic as specified in the design document:
   * 1. Filter for records where is_active_config is true
   * 2. Find any schedule where current time is between start_datetime and end_datetime
   * 3. Return appropriate response based on findings
   */
  public async getMaintenanceStatus(): Promise<MaintenanceStatusResponse> {
    try {
      const currentTime = new Date();

      logger.debug(`Checking maintenance status at ${currentTime.toISOString()}`);

      // Step 1 & 2: Query for active schedules where current time is within the window
      const currentlyActiveSchedule = await MaintenanceSchedule.findOne({
        order: [["endDatetime", "ASC"]], // If multiple, get the one ending soonest
        where: {
          endDatetime: {
            [Op.gt]: currentTime // end_datetime > current_time
          },
          isActiveConfig: true,
          startDatetime: {
            [Op.lte]: currentTime // start_datetime <= current_time
          }
        }
      });

      // Step 3: Build and return the response
      if (currentlyActiveSchedule) {
        // Calculate estimated time remaining in seconds
        const timeRemainingMs = currentlyActiveSchedule.endDatetime.getTime() - currentTime.getTime();
        const timeRemainingSeconds = Math.max(0, Math.floor(timeRemainingMs / 1000));

        const response: MaintenanceStatusResponse = {
          is_maintenance_active: true,
          maintenance_details: {
            end_datetime: currentlyActiveSchedule.endDatetime.toISOString(),
            estimated_time_remaining_seconds: timeRemainingSeconds,
            message: currentlyActiveSchedule.messageToDisplay,
            start_datetime: currentlyActiveSchedule.startDatetime.toISOString(),
            title: currentlyActiveSchedule.title
          }
        };

        logger.info(`Maintenance is currently active: ${currentlyActiveSchedule.title}`);
        return response;
      } else {
        const response: MaintenanceStatusResponse = {
          is_maintenance_active: false,
          maintenance_details: null
        };

        logger.debug("No active maintenance windows found");
        return response;
      }
    } catch (error) {
      logger.error("Error checking maintenance status:", error);
      throw new Error("Failed to retrieve maintenance status");
    }
  }
}

// Export singleton instance
export const maintenanceService = MaintenanceService.getInstance();
