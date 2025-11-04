import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface UserAttributes {
  id: string; // UUID from Supabase Auth
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

type UserCreationAttributes = Optional<UserAttributes, "createdAt" | "updatedAt">;

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
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
        name: "idx_users_email",
        unique: true
      }
    ],
    modelName: "User",
    sequelize,
    tableName: "users",
    timestamps: true
  }
);

export default User;
