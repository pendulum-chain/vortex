import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type RecipientInvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type RecipientInviteeType = "individual" | "business";

// Link-based recipient invite (plan D1): token_hash is the redemption key — the raw token is
// never stored; invitee_email is optional metadata, matched at acceptance only if recorded.
export interface RecipientInvitationAttributes {
  id: string;
  senderCustomerEntityId: string;
  createdByProfileId: string | null;
  inviteeEmail: string | null;
  inviteeEmailCanonical: string | null;
  inviteeType: RecipientInviteeType;
  country: string;
  rail: string;
  payoutCurrency: string;
  amount: string | null;
  status: RecipientInvitationStatus;
  tokenHash: string;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  acceptedByProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type RecipientInvitationCreationAttributes = Optional<
  RecipientInvitationAttributes,
  | "id"
  | "createdByProfileId"
  | "inviteeEmail"
  | "inviteeEmailCanonical"
  | "inviteeType"
  | "amount"
  | "status"
  | "expiresAt"
  | "acceptedAt"
  | "revokedAt"
  | "acceptedByProfileId"
  | "createdAt"
  | "updatedAt"
>;

class RecipientInvitation
  extends Model<RecipientInvitationAttributes, RecipientInvitationCreationAttributes>
  implements RecipientInvitationAttributes
{
  declare id: string;
  declare senderCustomerEntityId: string;
  declare createdByProfileId: string | null;
  declare inviteeEmail: string | null;
  declare inviteeEmailCanonical: string | null;
  declare inviteeType: RecipientInviteeType;
  declare country: string;
  declare rail: string;
  declare payoutCurrency: string;
  declare amount: string | null;
  declare status: RecipientInvitationStatus;
  declare tokenHash: string;
  declare expiresAt: Date | null;
  declare acceptedAt: Date | null;
  declare revokedAt: Date | null;
  declare acceptedByProfileId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

RecipientInvitation.init(
  {
    acceptedAt: {
      allowNull: true,
      field: "accepted_at",
      type: DataTypes.DATE
    },
    acceptedByProfileId: {
      allowNull: true,
      field: "accepted_by_profile_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    amount: {
      allowNull: true,
      type: DataTypes.DECIMAL(38, 18)
    },
    country: {
      allowNull: false,
      type: DataTypes.STRING(4)
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    createdByProfileId: {
      allowNull: true,
      field: "created_by_profile_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    expiresAt: {
      allowNull: true,
      field: "expires_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    inviteeEmail: {
      allowNull: true,
      field: "invitee_email",
      type: DataTypes.STRING(255)
    },
    inviteeEmailCanonical: {
      allowNull: true,
      field: "invitee_email_canonical",
      type: DataTypes.STRING(255)
    },
    inviteeType: {
      allowNull: false,
      defaultValue: "individual",
      field: "invitee_type",
      type: DataTypes.STRING(16)
    },
    payoutCurrency: {
      allowNull: false,
      field: "payout_currency",
      type: DataTypes.STRING(8)
    },
    rail: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    revokedAt: {
      allowNull: true,
      field: "revoked_at",
      type: DataTypes.DATE
    },
    senderCustomerEntityId: {
      allowNull: false,
      field: "sender_customer_entity_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.STRING(16)
    },
    tokenHash: {
      allowNull: false,
      field: "token_hash",
      type: DataTypes.STRING(128),
      unique: true
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
        fields: ["sender_customer_entity_id"],
        name: "idx_recipient_invitations_sender_entity"
      }
    ],
    modelName: "RecipientInvitation",
    sequelize,
    tableName: "recipient_invitations",
    timestamps: true
  }
);

export default RecipientInvitation;
