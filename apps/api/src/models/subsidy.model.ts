import { RampPhase } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// TODO how to take this from other types?
export enum SubsidyToken {
  GLMR = "GLMR",
  PEN = "PEN",
  XLM = "XLM",
  AXLUSDC = "USDC.axl",
  BRLA = "BRLA",
  EURC = "EURC",
  USDC = "USDC",
  MATIC = "MATIC",
  BRL = "BRL"
}

export interface SubsidyAttributes {
  id: string;
  rampId: string;
  phase: RampPhase;
  amount: number;
  token: SubsidyToken;
  paymentDate: Date;
  payerAccount: string;
  transactionHash: string;
  createdAt: Date;
  updatedAt: Date;
}

type SubsidyCreationAttributes = Optional<SubsidyAttributes, "id" | "createdAt" | "updatedAt">;

class Subsidy extends Model<SubsidyAttributes, SubsidyCreationAttributes> implements SubsidyAttributes {
  declare id: string;

  declare rampId: string;

  declare phase: RampPhase;

  declare amount: number;

  declare token: SubsidyToken;

  declare paymentDate: Date;

  declare payerAccount: string;

  declare transactionHash: string;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
Subsidy.init(
  {
    amount: {
      allowNull: false,
      comment: "Amount of subsidy payment as float32",
      type: DataTypes.FLOAT
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    payerAccount: {
      allowNull: false,
      comment: "Account address that made the subsidy payment",
      field: "payer_account",
      type: DataTypes.STRING(255)
    },
    paymentDate: {
      allowNull: false,
      comment: "Date when the subsidy payment was made",
      field: "payment_date",
      type: DataTypes.DATE
    },
    phase: {
      allowNull: false,
      comment: "Ramp phase during which the subsidy was applied",
      type: DataTypes.STRING(32)
    },
    rampId: {
      allowNull: false,
      comment: "Reference to the ramp state that received the subsidy",
      field: "ramp_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "ramp_states"
      },
      type: DataTypes.UUID
    },
    token: {
      allowNull: false,
      comment: "Token used for the subsidy payment",
      type: DataTypes.ENUM(...Object.values(SubsidyToken))
    },
    transactionHash: {
      allowNull: false,
      comment: "Transaction hash or external identifier for the subsidy payment",
      field: "transaction_hash",
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
        fields: ["ramp_id"],
        name: "idx_subsidies_ramp_id"
      },
      {
        fields: ["phase"],
        name: "idx_subsidies_phase"
      }
    ],
    modelName: "Subsidy",
    sequelize,
    tableName: "subsidies",
    timestamps: true
  }
);

export default Subsidy;
