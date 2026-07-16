import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type SenderRecipientStatus = "invited" | "active" | "blocked" | "archived";

// The sender↔recipient relationship after an invite is accepted. The sender owns this row;
// the recipient owns their own profile/entity/compliance identity, reusable across senders
// (UNIQUE(sender, recipient) — one recipient can be linked to many senders).
export interface SenderRecipientAttributes {
  id: string;
  senderCustomerEntityId: string;
  recipientCustomerEntityId: string;
  invitationId: string | null;
  relationshipStatus: SenderRecipientStatus;
  nickname: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type SenderRecipientCreationAttributes = Optional<
  SenderRecipientAttributes,
  "id" | "invitationId" | "relationshipStatus" | "nickname" | "disabledAt" | "createdAt" | "updatedAt"
>;

class SenderRecipient
  extends Model<SenderRecipientAttributes, SenderRecipientCreationAttributes>
  implements SenderRecipientAttributes
{
  declare id: string;
  declare senderCustomerEntityId: string;
  declare recipientCustomerEntityId: string;
  declare invitationId: string | null;
  declare relationshipStatus: SenderRecipientStatus;
  declare nickname: string | null;
  declare disabledAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

SenderRecipient.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    disabledAt: {
      allowNull: true,
      field: "disabled_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    invitationId: {
      allowNull: true,
      field: "invitation_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "recipient_invitations"
      },
      type: DataTypes.UUID
    },
    nickname: {
      allowNull: true,
      type: DataTypes.STRING(100)
    },
    recipientCustomerEntityId: {
      allowNull: false,
      field: "recipient_customer_entity_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    relationshipStatus: {
      allowNull: false,
      defaultValue: "invited",
      field: "relationship_status",
      type: DataTypes.STRING(16)
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
        fields: ["sender_customer_entity_id", "recipient_customer_entity_id"],
        name: "uniq_sender_recipients_pair",
        unique: true
      },
      {
        fields: ["recipient_customer_entity_id"],
        name: "idx_sender_recipients_recipient_entity"
      }
    ],
    modelName: "SenderRecipient",
    sequelize,
    tableName: "sender_recipients",
    timestamps: true
  }
);

export default SenderRecipient;
