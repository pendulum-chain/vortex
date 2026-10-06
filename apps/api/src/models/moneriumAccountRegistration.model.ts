import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum MoneriumAccountRegistrationStatus {
  /** Waiting for Monerium to approve the profile, or for the forwarder deployment. */
  Requested = "requested",
  /** The forwarder is deployed and the account mapped: `accountId` is set. Terminal. */
  Mapped = "mapped",
  /** Monerium rejected the profile, or the deployment or mapping was refused. Terminal. */
  Rejected = "rejected"
}

// A partner's request to onboard one Monerium profile with a destination, until the
// keeper has deployed the client's forwarder and mapped the account.
export interface MoneriumAccountRegistrationAttributes {
  id: string;
  managerProfileId: string;
  moneriumProfileId: string;
  externalSubjectId: string;
  contactEmail: string;
  /** Lowercased; fixed in the forwarder, never overwritten. */
  destination: string;
  status: MoneriumAccountRegistrationStatus;
  /** Set once the deployment was sent; cleared when it reverted. */
  deployTxHash: string | null;
  accountId: string | null;
  rejectedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumAccountRegistrationCreationAttributes = Optional<
  MoneriumAccountRegistrationAttributes,
  "id" | "status" | "deployTxHash" | "accountId" | "rejectedReason" | "createdAt" | "updatedAt"
>;

class MoneriumAccountRegistration
  extends Model<MoneriumAccountRegistrationAttributes, MoneriumAccountRegistrationCreationAttributes>
  implements MoneriumAccountRegistrationAttributes
{
  declare id: string;
  declare managerProfileId: string;
  declare moneriumProfileId: string;
  declare externalSubjectId: string;
  declare contactEmail: string;
  declare destination: string;
  declare status: MoneriumAccountRegistrationStatus;
  declare deployTxHash: string | null;
  declare accountId: string | null;
  declare rejectedReason: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumAccountRegistration.init(
  {
    accountId: { allowNull: true, field: "account_id", type: DataTypes.UUID },
    contactEmail: { allowNull: false, field: "contact_email", type: DataTypes.STRING(320) },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    deployTxHash: { allowNull: true, field: "deploy_tx_hash", type: DataTypes.STRING(66) },
    destination: { allowNull: false, type: DataTypes.STRING(42) },
    externalSubjectId: { allowNull: false, field: "external_subject_id", type: DataTypes.STRING(255) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    managerProfileId: { allowNull: false, field: "manager_profile_id", type: DataTypes.UUID },
    moneriumProfileId: { allowNull: false, field: "monerium_profile_id", type: DataTypes.STRING(64), unique: true },
    rejectedReason: { allowNull: true, field: "rejected_reason", type: DataTypes.STRING(500) },
    status: {
      allowNull: false,
      defaultValue: MoneriumAccountRegistrationStatus.Requested,
      type: DataTypes.ENUM(...Object.values(MoneriumAccountRegistrationStatus))
    },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [{ fields: ["status"] }],
    modelName: "MoneriumAccountRegistration",
    sequelize,
    tableName: "monerium_account_registrations"
  }
);

export default MoneriumAccountRegistration;
