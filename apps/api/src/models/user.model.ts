import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface UserAttributes {
  id: string; // UUID from Supabase Auth
  email: string;
  activeCustomerEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type UserCreationAttributes = Optional<UserAttributes, "activeCustomerEntityId" | "createdAt" | "updatedAt">;

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
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
      allowNull: false,
      type: DataTypes.STRING(255),
      unique: true
    },
    id: {
      allowNull: false,
      comment: "User ID from Supabase Auth (synced)",
      primaryKey: true,
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
