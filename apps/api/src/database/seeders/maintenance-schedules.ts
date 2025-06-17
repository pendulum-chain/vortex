import sequelize from "../../config/database";
import logger from "../../config/logger";
import MaintenanceSchedule from "../../models/maintenanceSchedule.model";

/**
 * Seed script for maintenance schedules
 * This script adds sample maintenance schedules for testing purposes
 */
async function seedMaintenanceSchedules(): Promise<void> {
  try {
    await sequelize.authenticate();
    logger.info("Database connection established for seeding maintenance schedules");

    const now = new Date();

    // Sample maintenance schedules
    const schedules = [
      {
        title: "Past Database Upgrade",
        startDatetime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        endDatetime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        messageToDisplay: "System was under maintenance for database upgrades.",
        isActiveConfig: true,
        notes: "Completed successfully"
      },
      {
        title: "Scheduled System Update",
        startDatetime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour from now
        endDatetime: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours from now
        messageToDisplay:
          "Pendulum Pay is undergoing scheduled maintenance. We expect to be back online soon. Thank you for your patience.",
        isActiveConfig: false, // Set to true to activate
        notes: "Planned system updates and optimizations"
      },
      {
        title: "Emergency Maintenance Window",
        startDatetime: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
        endDatetime: new Date(now.getTime() + 26 * 60 * 60 * 1000), // 26 hours from now
        messageToDisplay: "Emergency maintenance in progress. Service will be restored as soon as possible.",
        isActiveConfig: false,
        notes: "Emergency maintenance window for critical fixes"
      }
    ];

    // Clear existing schedules
    await MaintenanceSchedule.destroy({ where: {} });
    logger.info("Cleared existing maintenance schedules");

    // Insert new schedules
    const createdSchedules = await MaintenanceSchedule.bulkCreate(schedules);
    logger.info(`Created ${createdSchedules.length} maintenance schedules`);

    // Log the created schedules
    createdSchedules.forEach(schedule => {
      logger.info(`Created schedule: ${schedule.title} (${schedule.id})`);
    });

    logger.info("Maintenance schedules seeding completed successfully");
  } catch (error) {
    logger.error("Error seeding maintenance schedules:", error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      await seedMaintenanceSchedules();
      process.exit(0);
    } catch (error) {
      console.error("Error seeding maintenance schedules:", error);
      process.exit(1);
    }
  })();
}

export { seedMaintenanceSchedules };
