import { DataTypes, Model, Op, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumFiatDepositStatus {
  Pending = "pending",
  Minted = "minted",
  Held = "held",
  Returned = "returned"
}

// One row per Monerium issue order (SEPA deposit → EURe mint). Identity/idempotency:
// monerium_order_id for accounting, (chain_id, tx_hash, log_index) for the on-chain
// mint. Status transitions are forward-only (plan §3, R06/R13).
export interface MoneriumFiatDepositAttributes {
  id: string;
  accountId: string;
  moneriumOrderId: string;
  amountRaw: string; // EURe base units (18 decimals), stringified
  currency: string;
  status: MoneriumFiatDepositStatus;
  chainId: number | null;
  txHash: string | null;
  logIndex: number | null;
  blockHash: string | null;
  blockNumber: number | null;
  allocatedExecutionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumFiatDepositCreationAttributes = Optional<
  MoneriumFiatDepositAttributes,
  | "id"
  | "status"
  | "chainId"
  | "txHash"
  | "logIndex"
  | "blockHash"
  | "blockNumber"
  | "allocatedExecutionId"
  | "createdAt"
  | "updatedAt"
>;

class MoneriumFiatDeposit
  extends Model<MoneriumFiatDepositAttributes, MoneriumFiatDepositCreationAttributes>
  implements MoneriumFiatDepositAttributes
{
  declare id: string;
  declare accountId: string;
  declare moneriumOrderId: string;
  declare amountRaw: string;
  declare currency: string;
  declare status: MoneriumFiatDepositStatus;
  declare chainId: number | null;
  declare txHash: string | null;
  declare logIndex: number | null;
  declare blockHash: string | null;
  declare blockNumber: number | null;
  declare allocatedExecutionId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumFiatDeposit.init(
  {
    accountId: {
      allowNull: false,
      field: "account_id",
      type: DataTypes.UUID
    },
    allocatedExecutionId: {
      allowNull: true,
      field: "allocated_execution_id",
      type: DataTypes.UUID
    },
    amountRaw: {
      allowNull: false,
      field: "amount_raw",
      type: DataTypes.DECIMAL(38, 0)
    },
    blockHash: {
      allowNull: true,
      field: "block_hash",
      type: DataTypes.STRING(66)
    },
    // Mint block, set by the mint watcher; the R04 attribution rule compares it to the
    // execution block (docs/prd/monerium-b2b-implementation-plan.md §3).
    blockNumber: {
      allowNull: true,
      field: "block_number",
      type: DataTypes.INTEGER
    },
    chainId: {
      allowNull: true,
      field: "chain_id",
      type: DataTypes.INTEGER
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    currency: {
      allowNull: false,
      defaultValue: "eur",
      type: DataTypes.STRING(8)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    logIndex: {
      allowNull: true,
      field: "log_index",
      type: DataTypes.INTEGER
    },
    moneriumOrderId: {
      allowNull: false,
      field: "monerium_order_id",
      type: DataTypes.STRING(64),
      unique: true
    },
    status: {
      allowNull: false,
      defaultValue: MoneriumFiatDepositStatus.Pending,
      type: DataTypes.ENUM(...Object.values(MoneriumFiatDepositStatus))
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
    }
  },
  {
    indexes: [
      { fields: ["account_id", "status"] },
      { fields: ["chain_id", "tx_hash", "log_index"], unique: true, where: { tx_hash: { [Op.ne]: null } } }
    ],
    modelName: "MoneriumFiatDeposit",
    sequelize,
    tableName: "monerium_fiat_deposits"
  }
);

export default MoneriumFiatDeposit;
