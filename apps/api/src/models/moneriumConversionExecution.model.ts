import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumConversionExecutionStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Failed = "failed"
}

// One row per swapAndForward execution (or intentional batch). Allocation to deposits
// is snapshot-based (plan §3, R04): included deposits are those with mint block <=
// execution block not yet allocated; pro-rata by amount, remainder to largest.
export interface MoneriumConversionExecutionAttributes {
  id: string;
  accountId: string;
  eureInRaw: string; // 18-decimal base units
  usdcGrossRaw: string | null; // 6-decimal base units
  feeRaw: string | null;
  usdcNetRaw: string | null;
  destination: string;
  txHash: string | null;
  blockNumber: number | null;
  status: MoneriumConversionExecutionStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumConversionExecutionCreationAttributes = Optional<
  MoneriumConversionExecutionAttributes,
  "id" | "usdcGrossRaw" | "feeRaw" | "usdcNetRaw" | "txHash" | "blockNumber" | "status" | "error" | "createdAt" | "updatedAt"
>;

class MoneriumConversionExecution
  extends Model<MoneriumConversionExecutionAttributes, MoneriumConversionExecutionCreationAttributes>
  implements MoneriumConversionExecutionAttributes
{
  declare id: string;
  declare accountId: string;
  declare eureInRaw: string;
  declare usdcGrossRaw: string | null;
  declare feeRaw: string | null;
  declare usdcNetRaw: string | null;
  declare destination: string;
  declare txHash: string | null;
  declare blockNumber: number | null;
  declare status: MoneriumConversionExecutionStatus;
  declare error: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumConversionExecution.init(
  {
    accountId: {
      allowNull: false,
      field: "account_id",
      type: DataTypes.UUID
    },
    blockNumber: {
      allowNull: true,
      field: "block_number",
      type: DataTypes.INTEGER
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    destination: {
      allowNull: false,
      type: DataTypes.STRING(42)
    },
    error: {
      allowNull: true,
      type: DataTypes.TEXT
    },
    eureInRaw: {
      allowNull: false,
      field: "eure_in_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    feeRaw: {
      allowNull: true,
      field: "fee_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: MoneriumConversionExecutionStatus.Pending,
      type: DataTypes.ENUM(...Object.values(MoneriumConversionExecutionStatus))
    },
    txHash: {
      allowNull: true,
      field: "tx_hash",
      type: DataTypes.STRING(66)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    usdcGrossRaw: {
      allowNull: true,
      field: "usdc_gross_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    usdcNetRaw: {
      allowNull: true,
      field: "usdc_net_raw",
      type: DataTypes.DECIMAL(38, 0)
    }
  },
  {
    indexes: [{ fields: ["account_id", "status"] }],
    modelName: "MoneriumConversionExecution",
    sequelize,
    tableName: "monerium_conversion_executions"
  }
);

export default MoneriumConversionExecution;
