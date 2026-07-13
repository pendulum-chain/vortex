import { AlfredPayStatus, MykoboCustomerStatus } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type ProviderName = "mykobo" | "alfredpay" | "avenia" | "monerium";
export type ProviderCustomerType = "individual" | "business";
export type MoneriumStatus = "PENDING" | "APPROVED" | "REJECTED";

// Same values as the legacy TaxIdInternalStatus — the Avenia KYC workflow vocabulary,
// carried verbatim so existing status comparisons survive the cutover.
export enum AveniaKycStatus {
  Consulted = "Consulted",
  Requested = "Requested",
  Accepted = "Accepted",
  Rejected = "Rejected"
}

// Existing providers retain their native status machines. Monerium is normalized on write
// to PENDING/APPROVED/REJECTED while its raw profile state is kept in statusExternal.
export type ProviderCustomerStatus = MykoboCustomerStatus | AlfredPayStatus | AveniaKycStatus | MoneriumStatus;

// One anchor for every provider/rail account, owned by exactly
// one customer_entity. Folds the legacy mykobo_customers/alfredpay_customers tables and the
// Avenia half of tax_ids. taxReference holds the raw normalized tax id (avenia only — it is
// the join/aggregation key for in-flight ramp state); the sha256 hash backs the uniqueness
// guard and hashed lookups, the masked value is for display.
export interface ProviderCustomerAttributes {
  id: string;
  customerEntityId: string;
  provider: ProviderName;
  rail: string | null;
  country: string | null;
  providerCustomerId: string | null;
  providerSubaccountId: string | null;
  taxReference: string | null;
  taxReferenceHash: string | null;
  taxReferenceMasked: string | null;
  customerType: ProviderCustomerType;
  status: ProviderCustomerStatus;
  statusExternal: string | null;
  lastFailureReasons: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

type ProviderCustomerCreationAttributes = Optional<
  ProviderCustomerAttributes,
  | "id"
  | "rail"
  | "country"
  | "providerCustomerId"
  | "providerSubaccountId"
  | "taxReference"
  | "taxReferenceHash"
  | "taxReferenceMasked"
  | "customerType"
  | "statusExternal"
  | "lastFailureReasons"
  | "createdAt"
  | "updatedAt"
>;

class ProviderCustomer
  extends Model<ProviderCustomerAttributes, ProviderCustomerCreationAttributes>
  implements ProviderCustomerAttributes
{
  declare id: string;
  declare customerEntityId: string;
  declare provider: ProviderName;
  declare rail: string | null;
  declare country: string | null;
  declare providerCustomerId: string | null;
  declare providerSubaccountId: string | null;
  declare taxReference: string | null;
  declare taxReferenceHash: string | null;
  declare taxReferenceMasked: string | null;
  declare customerType: ProviderCustomerType;
  declare status: ProviderCustomerStatus;
  declare statusExternal: string | null;
  declare lastFailureReasons: string[] | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ProviderCustomer.init(
  {
    country: {
      allowNull: true,
      type: DataTypes.STRING(4)
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    customerEntityId: {
      allowNull: false,
      field: "customer_entity_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    customerType: {
      allowNull: false,
      defaultValue: "individual",
      field: "customer_type",
      type: DataTypes.STRING(16)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastFailureReasons: {
      allowNull: true,
      defaultValue: [],
      field: "last_failure_reasons",
      type: DataTypes.JSONB
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    providerCustomerId: {
      allowNull: true,
      field: "provider_customer_id",
      type: DataTypes.STRING(255)
    },
    providerSubaccountId: {
      allowNull: true,
      field: "provider_subaccount_id",
      type: DataTypes.STRING(255)
    },
    rail: {
      allowNull: true,
      type: DataTypes.STRING(8)
    },
    status: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    statusExternal: {
      allowNull: true,
      field: "status_external",
      type: DataTypes.STRING(255)
    },
    taxReference: {
      allowNull: true,
      field: "tax_reference",
      type: DataTypes.STRING(32)
    },
    taxReferenceHash: {
      allowNull: true,
      field: "tax_reference_hash",
      type: DataTypes.STRING(64)
    },
    taxReferenceMasked: {
      allowNull: true,
      field: "tax_reference_masked",
      type: DataTypes.STRING(64)
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
        fields: ["customer_entity_id"],
        name: "idx_provider_customers_customer_entity_id"
      }
    ],
    modelName: "ProviderCustomer",
    sequelize,
    tableName: "provider_customers",
    timestamps: true
  }
);

export default ProviderCustomer;
