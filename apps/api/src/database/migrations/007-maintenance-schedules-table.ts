import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Enable uuid-ossp extension if not already enabled
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  // Create maintenance_schedules table
  await queryInterface.createTable("maintenance_schedules", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    start_datetime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_datetime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    message_to_display: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_active_config: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Create indexes for efficient querying
  await queryInterface.addIndex("maintenance_schedules", ["is_active_config", "start_datetime", "end_datetime"], {
    name: "idx_maintenance_schedules_active_period"
  });

  await queryInterface.addIndex("maintenance_schedules", ["is_active_config"], {
    name: "idx_maintenance_schedules_active"
  });

  // Create trigger function to update updated_at timestamp
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create trigger for maintenance_schedules table
  await queryInterface.sequelize.query(`
    CREATE TRIGGER update_maintenance_schedules_updated_at
    BEFORE UPDATE ON maintenance_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop trigger
  await queryInterface.sequelize.query(
    "DROP TRIGGER IF EXISTS update_maintenance_schedules_updated_at ON maintenance_schedules;"
  );

  // Drop indexes
  await queryInterface.removeIndex("maintenance_schedules", "idx_maintenance_schedules_active_period");
  await queryInterface.removeIndex("maintenance_schedules", "idx_maintenance_schedules_active");

  // Drop table
  await queryInterface.dropTable("maintenance_schedules");

  // Note: We don't drop the trigger function as it might be used by other tables
}
