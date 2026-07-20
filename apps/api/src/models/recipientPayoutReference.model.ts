import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type { ProviderName } from "./providerCustomer.model";

export type RecipientPayoutReferenceStatus = "pending" | "verified" | "rejected" | "disabled";
export type PayoutInstrumentType = "pix" | "iban" | "clabe" | "ach" | "cbu_cvu" | "account_number";

// Thin pointer to a provider-side payout instrument (plan D3): provider_instrument_id +
// masked label only — no reusable PIX/IBAN/ACH/CLABE/CBU PII is ever stored locally. One
// non-disabled reference per relationship/corridor (partial unique in the migration).
export interface RecipientPayoutReferenceAttributes {
  id: string;
  senderRecipientId: string;
  recipientCustomerEntityId: string;
  provider: ProviderName;
  country: string;
  rail: string;
  currency: string;
  instrumentType: PayoutInstrumentType;
  providerInstrumentId: string | null;
  maskedDisplayLabel: string | null;
  status: RecipientPayoutReferenceStatus;
  lastProviderSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type RecipientPayoutReferenceCreationAttributes = Optional<
  RecipientPayoutReferenceAttributes,
  "id" | "providerInstrumentId" | "maskedDisplayLabel" | "status" | "lastProviderSyncAt" | "createdAt" | "updatedAt"
>;

class RecipientPayoutReference
  extends Model<RecipientPayoutReferenceAttributes, RecipientPayoutReferenceCreationAttributes>
  implements RecipientPayoutReferenceAttributes
{
  declare id: string;
  declare senderRecipientId: string;
  declare recipientCustomerEntityId: string;
  declare provider: ProviderName;
  declare country: string;
  declare rail: string;
  declare currency: string;
  declare instrumentType: PayoutInstrumentType;
  declare providerInstrumentId: string | null;
  declare maskedDisplayLabel: string | null;
  declare status: RecipientPayoutReferenceStatus;
  declare lastProviderSyncAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

RecipientPayoutReference.init(
  {
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
    currency: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    instrumentType: {
      allowNull: false,
      field: "instrument_type",
      type: DataTypes.STRING(20)
    },
    lastProviderSyncAt: {
      allowNull: true,
      field: "last_provider_sync_at",
      type: DataTypes.DATE
    },
    maskedDisplayLabel: {
      allowNull: true,
      field: "masked_display_label",
      type: DataTypes.STRING(255)
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    providerInstrumentId: {
      allowNull: true,
      field: "provider_instrument_id",
      type: DataTypes.STRING(255)
    },
    rail: {
      allowNull: false,
      type: DataTypes.STRING(8)
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
    senderRecipientId: {
      allowNull: false,
      field: "sender_recipient_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "sender_recipients"
      },
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.STRING(16)
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
        fields: ["recipient_customer_entity_id"],
        name: "idx_recipient_payout_references_recipient_entity"
      }
    ],
    modelName: "RecipientPayoutReference",
    sequelize,
    tableName: "recipient_payout_references",
    timestamps: true
  }
);

export default RecipientPayoutReference;
