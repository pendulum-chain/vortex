import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumConversionExecutionStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Failed = "failed"
}

// One row per swapAndForward execution (or intentional batch). Allocation to deposits
// is cursor-gated and snapshot-based (plan §3, R04): included deposits precede the
// execution's exact block/log position and are not yet allocated; pro-rata by amount,
// remainder to largest.
export interface MoneriumConversionExecutionAttributes {
  id: string;
  accountId: string;
  eureInRaw: string; // 18-decimal base units
  usdcGrossRaw: string | null; // 6-decimal base units
  feeRaw: string | null;
  /** USDC the subsidy vault paid straight to the destination for this swap (6 decimals). */
  subsidyRaw: string | null;
  usdcNetRaw: string | null;
  destination: string;
  /** Partner reference the swap was priced against, ORACLE_DECIMALS; persisted before broadcast. */
  referenceRateRaw: string | null;
  referenceSource: string | null;
  referenceTradeId: string | null;
  referenceAt: Date | null;
  /** Factory route index the swap executed. */
  routeIndex: number | null;
  txHash: string | null;
  /** The swap's transaction nonce, persisted BEFORE broadcast (crash-recovery identity). */
  nonce: number | null;
  /** Chain head observed with the nonce, persisted before broadcast for complete recovery scans. */
  broadcastBlockNumber: number | null;
  blockNumber: number | null;
  /** Block-global SwapExecuted log position used as the deposit snapshot boundary. */
  swapLogIndex: number | null;
  status: MoneriumConversionExecutionStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumConversionExecutionCreationAttributes = Optional<
  MoneriumConversionExecutionAttributes,
  | "id"
  | "usdcGrossRaw"
  | "feeRaw"
  | "subsidyRaw"
  | "usdcNetRaw"
  | "referenceRateRaw"
  | "referenceSource"
  | "referenceTradeId"
  | "referenceAt"
  | "routeIndex"
  | "txHash"
  | "nonce"
  | "broadcastBlockNumber"
  | "blockNumber"
  | "swapLogIndex"
  | "status"
  | "error"
  | "createdAt"
  | "updatedAt"
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
  declare subsidyRaw: string | null;
  declare usdcNetRaw: string | null;
  declare destination: string;
  declare referenceRateRaw: string | null;
  declare referenceSource: string | null;
  declare referenceTradeId: string | null;
  declare referenceAt: Date | null;
  declare routeIndex: number | null;
  declare txHash: string | null;
  declare nonce: number | null;
  declare broadcastBlockNumber: number | null;
  declare blockNumber: number | null;
  declare swapLogIndex: number | null;
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
    broadcastBlockNumber: {
      allowNull: true,
      field: "broadcast_block_number",
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
    nonce: {
      allowNull: true,
      type: DataTypes.INTEGER
    },
    referenceAt: {
      allowNull: true,
      field: "reference_at",
      type: DataTypes.DATE
    },
    referenceRateRaw: {
      allowNull: true,
      field: "reference_rate_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    referenceSource: {
      allowNull: true,
      field: "reference_source",
      type: DataTypes.STRING(64)
    },
    referenceTradeId: {
      allowNull: true,
      field: "reference_trade_id",
      type: DataTypes.STRING(32)
    },
    routeIndex: {
      allowNull: true,
      field: "route_index",
      type: DataTypes.INTEGER
    },
    status: {
      allowNull: false,
      defaultValue: MoneriumConversionExecutionStatus.Pending,
      type: DataTypes.ENUM(...Object.values(MoneriumConversionExecutionStatus))
    },
    subsidyRaw: {
      allowNull: true,
      field: "subsidy_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    swapLogIndex: {
      allowNull: true,
      field: "swap_log_index",
      type: DataTypes.INTEGER
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
