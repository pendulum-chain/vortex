import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the Anchor model
export interface AnchorAttributes {
  id: string; // UUID
  rampType: "on" | "off";
  identifier: string | null;
  valueType: "absolute" | "relative";
  value: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type AnchorCreationAttributes = Optional<AnchorAttributes, "id" | "createdAt" | "updatedAt">;

// Define the Anchor model
class Anchor extends Model<AnchorAttributes, AnchorCreationAttributes> implements AnchorAttributes {
  declare id: string;

  declare rampType: "on" | "off";

  declare identifier: string | null;

  declare valueType: "absolute" | "relative";

  declare value: number;

  declare currency: string;

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
Anchor.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    rampType: {
      type: DataTypes.ENUM("on", "off"),
      allowNull: false,
      field: "ramp_type"
    },
    identifier: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"'
    },
    valueType: {
      type: DataTypes.ENUM("absolute", "relative"),
      allowNull: false,
      field: "value_type"
    },
    value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "USD"
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active"
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
    modelName: "Anchor",
    tableName: "anchors",
    timestamps: true,
    indexes: [
      {
        name: "idx_anchors_lookup",
        fields: ["ramp_type", "identifier", "is_active"]
      }
    ]
  }
);

export default Anchor;
