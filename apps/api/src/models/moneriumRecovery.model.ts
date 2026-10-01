import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

/**
 * Where a refund stands (docs/architecture-monerium-b2b-onramp.md, "the refund path").
 * A failure keeps the phase it failed in and marks the deposit `recovery_failed`; an
 * operator retry (deposit back to `recovering`) resumes from that phase.
 */
export enum MoneriumRecoveryPhase {
  /** The keeper's `recover` is confirmed: the payment sits on the recovery wallet. */
  Moved = "moved",
  /** The reverse swap (USDC -> EURe) was sent. */
  Swapping = "swapping",
  /** The recovery wallet holds only EURe for this payment. */
  Swapped = "swapped",
  /** The float top-up (or the surplus sweep) was sent. */
  ToppingUp = "topping_up",
  /** The recovery wallet holds exactly the refund amount. */
  ToppedUp = "topped_up",
  /** The Monerium redeem order was placed. */
  Redeeming = "redeeming",
  /** Monerium processed the redeem order: the payer was refunded. Terminal. */
  Redeemed = "redeemed"
}

// One row per refunded deposit; at most one row is active (not redeemed) at a time,
// because every step reasons about the dedicated recovery wallet's balances.
export interface MoneriumRecoveryAttributes {
  id: string;
  depositId: string;
  phase: MoneriumRecoveryPhase;
  /** Moved off the clone by `recover` (18 / 6 decimals). */
  eureRecoveredRaw: string;
  usdcRecoveredRaw: string;
  reverseSwapTxHash: string | null;
  /** EURe the reverse swap produced (18 decimals). */
  eureFromSwapRaw: string | null;
  floatTopupTxHash: string | null;
  /** EURe the float paid to reach the refund amount: the refund's subsidy (18 decimals). */
  floatTopupRaw: string | null;
  /** EURe the reverse swap produced beyond the refund amount, swept to the float (18 decimals). */
  surplusRaw: string | null;
  surplusTxHash: string | null;
  /** The EUR amount redeemed, as Monerium expects it ("1234.56"). */
  refundAmount: string | null;
  redeemOrderId: string | null;
  attempts: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumRecoveryCreationAttributes = Optional<
  MoneriumRecoveryAttributes,
  | "id"
  | "reverseSwapTxHash"
  | "eureFromSwapRaw"
  | "floatTopupTxHash"
  | "floatTopupRaw"
  | "surplusRaw"
  | "surplusTxHash"
  | "refundAmount"
  | "redeemOrderId"
  | "attempts"
  | "error"
  | "createdAt"
  | "updatedAt"
>;

class MoneriumRecovery
  extends Model<MoneriumRecoveryAttributes, MoneriumRecoveryCreationAttributes>
  implements MoneriumRecoveryAttributes
{
  declare id: string;
  declare depositId: string;
  declare phase: MoneriumRecoveryPhase;
  declare eureRecoveredRaw: string;
  declare usdcRecoveredRaw: string;
  declare reverseSwapTxHash: string | null;
  declare eureFromSwapRaw: string | null;
  declare floatTopupTxHash: string | null;
  declare floatTopupRaw: string | null;
  declare surplusRaw: string | null;
  declare surplusTxHash: string | null;
  declare refundAmount: string | null;
  declare redeemOrderId: string | null;
  declare attempts: number;
  declare error: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumRecovery.init(
  {
    attempts: { allowNull: false, defaultValue: 0, type: DataTypes.INTEGER },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    depositId: { allowNull: false, field: "deposit_id", type: DataTypes.UUID, unique: true },
    error: { allowNull: true, type: DataTypes.TEXT },
    eureFromSwapRaw: { allowNull: true, field: "eure_from_swap_raw", type: DataTypes.DECIMAL(38, 0) },
    eureRecoveredRaw: { allowNull: false, field: "eure_recovered_raw", type: DataTypes.DECIMAL(38, 0) },
    floatTopupRaw: { allowNull: true, field: "float_topup_raw", type: DataTypes.DECIMAL(38, 0) },
    floatTopupTxHash: { allowNull: true, field: "float_topup_tx_hash", type: DataTypes.STRING(66) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    phase: { allowNull: false, type: DataTypes.ENUM(...Object.values(MoneriumRecoveryPhase)) },
    redeemOrderId: { allowNull: true, field: "redeem_order_id", type: DataTypes.STRING(64) },
    refundAmount: { allowNull: true, field: "refund_amount", type: DataTypes.STRING(32) },
    reverseSwapTxHash: { allowNull: true, field: "reverse_swap_tx_hash", type: DataTypes.STRING(66) },
    surplusRaw: { allowNull: true, field: "surplus_raw", type: DataTypes.DECIMAL(38, 0) },
    surplusTxHash: { allowNull: true, field: "surplus_tx_hash", type: DataTypes.STRING(66) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE },
    usdcRecoveredRaw: { allowNull: false, field: "usdc_recovered_raw", type: DataTypes.DECIMAL(38, 0) }
  },
  {
    indexes: [{ fields: ["phase"] }],
    modelName: "MoneriumRecovery",
    sequelize,
    tableName: "monerium_recoveries"
  }
);

export default MoneriumRecovery;
