import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface MoneriumDepositAllocationAttributes {
  id: string;
  depositId: string;
  executionId: string;
  /** Portion of the deposit consumed by this execution (EURe, 18 decimals). */
  eureInRaw: string;
  /** Portion of this execution's net swap output attributed to this deposit (6 decimals). */
  usdcNetRaw: string;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumDepositAllocationCreationAttributes = Optional<
  MoneriumDepositAllocationAttributes,
  "id" | "createdAt" | "updatedAt"
>;

class MoneriumDepositAllocation
  extends Model<MoneriumDepositAllocationAttributes, MoneriumDepositAllocationCreationAttributes>
  implements MoneriumDepositAllocationAttributes
{
  declare id: string;
  declare depositId: string;
  declare executionId: string;
  declare eureInRaw: string;
  declare usdcNetRaw: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumDepositAllocation.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    depositId: {
      allowNull: false,
      field: "deposit_id",
      type: DataTypes.UUID
    },
    eureInRaw: {
      allowNull: false,
      field: "eure_in_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    executionId: {
      allowNull: false,
      field: "execution_id",
      type: DataTypes.UUID
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    usdcNetRaw: {
      allowNull: false,
      field: "usdc_net_raw",
      type: DataTypes.DECIMAL(38, 0)
    }
  },
  {
    indexes: [{ fields: ["deposit_id", "execution_id"], unique: true }, { fields: ["execution_id"] }],
    modelName: "MoneriumDepositAllocation",
    sequelize,
    tableName: "monerium_deposit_allocations"
  }
);

export default MoneriumDepositAllocation;
