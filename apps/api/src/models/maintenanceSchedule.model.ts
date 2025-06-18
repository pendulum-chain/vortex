import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the MaintenanceSchedule model
export interface MaintenanceScheduleAttributes {
  id: string; // UUID
  title: string;
  startDatetime: Date;
  endDatetime: Date;
  messageToDisplay: string;
  isActiveConfig: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type MaintenanceScheduleCreationAttributes = Optional<MaintenanceScheduleAttributes, "id" | "createdAt" | "updatedAt">;

// Define the MaintenanceSchedule model
class MaintenanceSchedule
  extends Model<MaintenanceScheduleAttributes, MaintenanceScheduleCreationAttributes>
  implements MaintenanceScheduleAttributes
{
  declare id: string;

  declare title: string;

  declare startDatetime: Date;

  declare endDatetime: Date;

  declare messageToDisplay: string;

  declare isActiveConfig: boolean;

  declare notes?: string;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
MaintenanceSchedule.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    endDatetime: {
      allowNull: false,
      field: "end_datetime",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    isActiveConfig: {
      allowNull: false,
      defaultValue: false,
      field: "is_active_config",
      type: DataTypes.BOOLEAN
    },
    messageToDisplay: {
      allowNull: false,
      field: "message_to_display",
      type: DataTypes.TEXT
    },
    notes: {
      allowNull: true,
      type: DataTypes.TEXT
    },
    startDatetime: {
      allowNull: false,
      field: "start_datetime",
      type: DataTypes.DATE
    },
    title: {
      allowNull: false,
      type: DataTypes.STRING(255)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  },
  {
    indexes: [
      {
        fields: ["is_active_config", "start_datetime", "end_datetime"],
        name: "idx_maintenance_schedules_active_period"
      },
      {
        fields: ["is_active_config"],
        name: "idx_maintenance_schedules_active"
      }
    ],
    modelName: "MaintenanceSchedule",
    sequelize,
    tableName: "maintenance_schedules",
    timestamps: true
  }
);

export default MaintenanceSchedule;
