import { RampDirection } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the Anchor model
export interface AnchorAttributes {
  id: string; // UUID
  rampType: RampDirection;
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

  declare rampType: RampDirection;

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
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    currency: {
      allowNull: false,
      defaultValue: "USD",
      type: DataTypes.STRING(8)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    identifier: {
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"',
      type: DataTypes.STRING(100)
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.ENUM(RampDirection.BUY, RampDirection.SELL)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    value: {
      allowNull: false,
      type: DataTypes.DECIMAL(10, 4)
    },
    valueType: {
      allowNull: false,
      field: "value_type",
      type: DataTypes.ENUM("absolute", "relative")
    }
  },
  {
    indexes: [
      {
        fields: ["ramp_type", "identifier", "is_active"],
        name: "idx_anchors_lookup"
      }
    ],
    modelName: "Anchor",
    sequelize,
    tableName: "anchors",
    timestamps: true
  }
);

export default Anchor;
