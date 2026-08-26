import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumAccountStatus {
  Onboarding = "onboarding",
  Active = "active",
  Suspended = "suspended",
  Closed = "closed"
}

// Persistent B2B onramp account (docs/architecture-monerium-b2b-onramp.md §3):
// one row per client = one Monerium profile + IBAN + deployed forwarder. Long-lived,
// repeatedly funded — deliberately NOT a RampState. profileId is the MONERIUM profile
// UUID; vortexProfileId is the owning Vortex managed profile (nullable only for rows
// that predate the managed-profile mapping).
export interface MoneriumAccountAttributes {
  id: string;
  profileId: string;
  vortexProfileId: string | null;
  iban: string | null;
  forwarderAddress: string;
  destination: string;
  fallbackAddress: string;
  feeBps: number;
  configVersion: number;
  status: MoneriumAccountStatus;
  dormantSince: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumAccountCreationAttributes = Optional<
  MoneriumAccountAttributes,
  "id" | "vortexProfileId" | "iban" | "configVersion" | "status" | "dormantSince" | "createdAt" | "updatedAt"
>;

class MoneriumAccount
  extends Model<MoneriumAccountAttributes, MoneriumAccountCreationAttributes>
  implements MoneriumAccountAttributes
{
  declare id: string;
  declare profileId: string;
  declare vortexProfileId: string | null;
  declare iban: string | null;
  declare forwarderAddress: string;
  declare destination: string;
  declare fallbackAddress: string;
  declare feeBps: number;
  declare configVersion: number;
  declare status: MoneriumAccountStatus;
  declare dormantSince: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumAccount.init(
  {
    configVersion: {
      allowNull: false,
      defaultValue: 1,
      field: "config_version",
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
    dormantSince: {
      allowNull: true,
      field: "dormant_since",
      type: DataTypes.DATE
    },
    fallbackAddress: {
      allowNull: false,
      field: "fallback_address",
      type: DataTypes.STRING(42)
    },
    feeBps: {
      allowNull: false,
      defaultValue: 0,
      field: "fee_bps",
      type: DataTypes.INTEGER
    },
    forwarderAddress: {
      allowNull: false,
      field: "forwarder_address",
      type: DataTypes.STRING(42),
      unique: true
    },
    iban: {
      allowNull: true,
      type: DataTypes.STRING(42)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      type: DataTypes.STRING(64),
      unique: true
    },
    status: {
      allowNull: false,
      defaultValue: MoneriumAccountStatus.Onboarding,
      type: DataTypes.ENUM(...Object.values(MoneriumAccountStatus))
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    vortexProfileId: {
      allowNull: true,
      field: "vortex_profile_id",
      type: DataTypes.UUID
    }
  },
  {
    indexes: [{ fields: ["status"] }],
    modelName: "MoneriumAccount",
    sequelize,
    tableName: "monerium_accounts"
  }
);

export default MoneriumAccount;
