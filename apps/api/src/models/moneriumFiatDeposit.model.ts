import { DataTypes, Model, Op, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumFiatDepositStatus {
  /** Provider order placed, EURe not minted yet. */
  Pending = "pending",
  /** EURe minted to the forwarder; convertible once chain-indexed. */
  Minted = "minted",
  /** Provider compliance hold before the mint. */
  Held = "held",
  /** Provider returned the payment before the mint. Terminal. */
  Returned = "returned",
  /** At least one chunk swap was sent; USDC accumulates on the forwarder. */
  Converting = "converting",
  /** The whole converted deposit reached the client's destination. Terminal. */
  Forwarded = "forwarded",
  /** The promised window was missed (or an operator intervened): funds go to the recovery wallet for a bank refund. */
  Recovering = "recovering",
  /** The exact EUR amount was redeemed to the payer's bank account. Terminal. */
  Refunded = "refunded",
  /** A recovery step failed beyond retry; operator runbook. Terminal until reset by an operator. */
  RecoveryFailed = "recovery_failed"
}

// One row per Monerium issue order (SEPA deposit → EURe mint). Identity/idempotency:
// monerium_order_id for accounting, (chain_id, tx_hash, log_index) for the on-chain
// mint. Status transitions are forward-only (plan §3, R06/R13): the provider states
// first, then the settlement (converting → forwarded) or refund (recovering → refunded)
// branch; executions bound to the deposit carry the chain evidence for each step.
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
  /** Timestamp of the mint block: the promised conversion window counts from here. */
  mintedAt: Date | null;
  /** The payer's bank account and name from the issue order's counterpart: the refund target. */
  payerIban: string | null;
  payerName: string | null;
  receivedEventAt: Date | null;
  convertedEventAt: Date | null;
  returnedEventAt: Date | null;
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
  | "mintedAt"
  | "payerIban"
  | "payerName"
  | "receivedEventAt"
  | "convertedEventAt"
  | "returnedEventAt"
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
  declare mintedAt: Date | null;
  declare payerIban: string | null;
  declare payerName: string | null;
  declare receivedEventAt: Date | null;
  declare convertedEventAt: Date | null;
  declare returnedEventAt: Date | null;
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
    // execution block (docs/architecture-monerium-b2b-onramp.md §3).
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
    convertedEventAt: {
      allowNull: true,
      field: "converted_event_at",
      type: DataTypes.DATE
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
    mintedAt: {
      allowNull: true,
      field: "minted_at",
      type: DataTypes.DATE
    },
    moneriumOrderId: {
      allowNull: false,
      field: "monerium_order_id",
      type: DataTypes.STRING(64),
      unique: true
    },
    payerIban: {
      allowNull: true,
      field: "payer_iban",
      type: DataTypes.STRING(34)
    },
    payerName: {
      allowNull: true,
      field: "payer_name",
      type: DataTypes.STRING(140)
    },
    receivedEventAt: {
      allowNull: true,
      field: "received_event_at",
      type: DataTypes.DATE
    },
    returnedEventAt: {
      allowNull: true,
      field: "returned_event_at",
      type: DataTypes.DATE
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
