import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface UserAttributes {
  id: string;
  email: string | null;
  kind: ProfileKind;
  activeCustomerEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProfileKind = "authenticated" | "managed";

type UserCreationAttributes = Optional<UserAttributes, "kind" | "activeCustomerEntityId" | "createdAt" | "updatedAt">;

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string | null;
  declare kind: ProfileKind;
  declare activeCustomerEntityId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
    activeCustomerEntityId: {
      allowNull: true,
      field: "active_customer_entity_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    email: {
      allowNull: true,
      type: DataTypes.STRING(255),
      unique: true
    },
    id: {
      allowNull: false,
      comment: "Profile ID; authenticated profiles use the Supabase Auth user ID",
      primaryKey: true,
      type: DataTypes.UUID
    },
    kind: {
      allowNull: false,
      defaultValue: "authenticated",
      type: DataTypes.STRING(20)
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
        fields: ["email"],
        name: "idx_profiles_email",
        unique: true
      }
    ],
    modelName: "User",
    sequelize,
    tableName: "profiles",
    timestamps: true
  }
);

export default User;
