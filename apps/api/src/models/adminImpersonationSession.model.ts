import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// A vortex_admin acting as another profile. `tokenHash` is the SHA-256 of the opaque
// bearer token handed to the operator once; the raw value is never persisted.
export interface AdminImpersonationSessionAttributes {
  id: string;
  actorProfileId: string;
  targetProfileId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type AdminImpersonationSessionCreationAttributes = Optional<
  AdminImpersonationSessionAttributes,
  "id" | "revokedAt" | "revokedReason" | "lastUsedAt" | "createdAt" | "updatedAt"
>;

class AdminImpersonationSession
  extends Model<AdminImpersonationSessionAttributes, AdminImpersonationSessionCreationAttributes>
  implements AdminImpersonationSessionAttributes
{
  declare id: string;
  declare actorProfileId: string;
  declare targetProfileId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare revokedReason: string | null;
  declare lastUsedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AdminImpersonationSession.init(
  {
    actorProfileId: {
      allowNull: false,
      field: "actor_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    expiresAt: { allowNull: false, field: "expires_at", type: DataTypes.DATE },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    lastUsedAt: { allowNull: true, field: "last_used_at", type: DataTypes.DATE },
    revokedAt: { allowNull: true, field: "revoked_at", type: DataTypes.DATE },
    revokedReason: { allowNull: true, field: "revoked_reason", type: DataTypes.STRING(100) },
    targetProfileId: {
      allowNull: false,
      field: "target_profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    tokenHash: { allowNull: false, field: "token_hash", type: DataTypes.CHAR(64) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      { fields: ["token_hash"], name: "uq_admin_impersonation_sessions_token_hash", unique: true },
      { fields: ["target_profile_id"], name: "idx_admin_impersonation_sessions_target" },
      { fields: ["actor_profile_id", "created_at"], name: "idx_admin_impersonation_sessions_actor_created" }
    ],
    modelName: "AdminImpersonationSession",
    sequelize,
    tableName: "admin_impersonation_sessions",
    timestamps: true
  }
);

export default AdminImpersonationSession;
