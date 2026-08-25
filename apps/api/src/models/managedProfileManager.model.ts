import type { CorridorCountry, CorridorCustomerType } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ManagedProfileManagerAttributes {
  profileId: string;
  allowedCorridors: CorridorCountry[];
  allowedCustomerTypes: CorridorCustomerType[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ManagedProfileManagerCreationAttributes = Optional<
  ManagedProfileManagerAttributes,
  "allowedCustomerTypes" | "isActive" | "createdAt" | "updatedAt"
>;

class ManagedProfileManager
  extends Model<ManagedProfileManagerAttributes, ManagedProfileManagerCreationAttributes>
  implements ManagedProfileManagerAttributes
{
  declare profileId: string;
  declare allowedCorridors: CorridorCountry[];
  declare allowedCustomerTypes: CorridorCustomerType[] | null;
  declare isActive: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ManagedProfileManager.init(
  {
    allowedCorridors: {
      allowNull: false,
      field: "allowed_corridors",
      type: DataTypes.ARRAY(DataTypes.STRING(2))
    },
    allowedCustomerTypes: {
      allowNull: true,
      defaultValue: null,
      field: "allowed_customer_types",
      type: DataTypes.ARRAY(DataTypes.STRING(10))
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      primaryKey: true,
      references: { key: "id", model: "profiles" },
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
    modelName: "ManagedProfileManager",
    sequelize,
    tableName: "managed_profile_managers",
    timestamps: true
  }
);

export default ManagedProfileManager;
