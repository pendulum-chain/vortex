import logger from '../../config/logger';

// Interface for maintenance schedule data
interface MaintenanceSchedule {
  id: string;
  title: string;
  start_datetime: Date;
  end_datetime: Date;
  message_to_display: string;
  is_active_config: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

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
 * For this initial implementation, it uses an in-memory store to simulate the database table.
 */
export class MaintenanceService {
  private static instance: MaintenanceService;

  // In-memory store for maintenance schedules (simulating the database table)
  private maintenanceSchedules: MaintenanceSchedule[] = [];

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Initialize with some sample data for testing
    this.initializeSampleData();
    logger.info('MaintenanceService initialized with in-memory store');
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
   * Initialize sample maintenance schedules for testing
   */
  private initializeSampleData(): void {
    const now = new Date();

    // Sample maintenance schedule that's currently inactive (in the past)
    this.maintenanceSchedules.push({
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Past Database Upgrade',
      start_datetime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      end_datetime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
      message_to_display: 'System was under maintenance for database upgrades.',
      is_active_config: true,
      notes: 'Completed successfully',
      created_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    });

    // Sample maintenance schedule for future (can be activated for testing)
    this.maintenanceSchedules.push({
      id: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Scheduled System Update',
      start_datetime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour from now
      end_datetime: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours from now
      message_to_display:
        'Pendulum Pay is undergoing scheduled maintenance. We expect to be back online soon. Thank you for your patience.',
      is_active_config: false, // Set to true to activate
      notes: 'Planned system updates and optimizations',
      created_at: now,
      updated_at: now,
    });

    logger.debug(`Initialized ${this.maintenanceSchedules.length} sample maintenance schedules`);
  }

  /**
   * Get all maintenance schedules (for debugging/admin purposes)
   */
  public getAllSchedules(): MaintenanceSchedule[] {
    return [...this.maintenanceSchedules];
  }

  /**
   * Add a new maintenance schedule to the in-memory store
   */
  public addSchedule(schedule: Omit<MaintenanceSchedule, 'id' | 'created_at' | 'updated_at'>): MaintenanceSchedule {
    const now = new Date();
    const newSchedule: MaintenanceSchedule = {
      ...schedule,
      id: this.generateUuid(),
      created_at: now,
      updated_at: now,
    };

    this.maintenanceSchedules.push(newSchedule);
    logger.info(`Added new maintenance schedule: ${newSchedule.title} (${newSchedule.id})`);

    return newSchedule;
  }

  /**
   * Update the active status of a maintenance schedule
   */
  public updateScheduleActiveStatus(id: string, isActive: boolean): boolean {
    const schedule = this.maintenanceSchedules.find((s) => s.id === id);
    if (!schedule) {
      logger.warn(`Maintenance schedule not found: ${id}`);
      return false;
    }

    schedule.is_active_config = isActive;
    schedule.updated_at = new Date();

    logger.info(`Updated maintenance schedule ${id} active status to: ${isActive}`);
    return true;
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

      // Step 1: Filter for active configurations
      const activeSchedules = this.maintenanceSchedules.filter((schedule) => schedule.is_active_config);

      logger.debug(`Found ${activeSchedules.length} active maintenance configurations`);

      // Step 2: Find any schedule that is currently active (current time within the window)
      const currentlyActiveSchedule = activeSchedules.find((schedule) => {
        const isWithinWindow = currentTime >= schedule.start_datetime && currentTime < schedule.end_datetime;

        if (isWithinWindow) {
          logger.debug(`Found active maintenance window: ${schedule.title} (${schedule.id})`);
        }

        return isWithinWindow;
      });

      // Step 3: Build and return the response
      if (currentlyActiveSchedule) {
        // Calculate estimated time remaining in seconds
        const timeRemainingMs = currentlyActiveSchedule.end_datetime.getTime() - currentTime.getTime();
        const timeRemainingSeconds = Math.max(0, Math.floor(timeRemainingMs / 1000));

        const response: MaintenanceStatusResponse = {
          is_maintenance_active: true,
          maintenance_details: {
            title: currentlyActiveSchedule.title,
            start_datetime: currentlyActiveSchedule.start_datetime.toISOString(),
            end_datetime: currentlyActiveSchedule.end_datetime.toISOString(),
            message: currentlyActiveSchedule.message_to_display,
            estimated_time_remaining_seconds: timeRemainingSeconds,
          },
        };

        logger.info(`Maintenance is currently active: ${currentlyActiveSchedule.title}`);
        return response;
      } else {
        const response: MaintenanceStatusResponse = {
          is_maintenance_active: false,
          maintenance_details: null,
        };

        logger.debug('No active maintenance windows found');
        return response;
      }
    } catch (error) {
      logger.error('Error checking maintenance status:', error);
      throw new Error('Failed to retrieve maintenance status');
    }
  }

  /**
   * Simple UUID generator for creating schedule IDs
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const maintenanceService = MaintenanceService.getInstance();
