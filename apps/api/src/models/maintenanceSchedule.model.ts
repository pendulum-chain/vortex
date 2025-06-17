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
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    startDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "start_datetime"
    },
    endDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "end_datetime"
    },
    messageToDisplay: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "message_to_display"
    },
    isActiveConfig: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_active_config"
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at",
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updated_at",
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: "MaintenanceSchedule",
    tableName: "maintenance_schedules",
    timestamps: true,
    indexes: [
      {
        name: "idx_maintenance_schedules_active_period",
        fields: ["is_active_config", "start_datetime", "end_datetime"]
      },
      {
        name: "idx_maintenance_schedules_active",
        fields: ["is_active_config"]
      }
    ]
  }
);

export default MaintenanceSchedule;
