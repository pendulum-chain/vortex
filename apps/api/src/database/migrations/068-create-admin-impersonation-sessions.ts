import { DataTypes, QueryInterface } from "sequelize";

// Short-lived sessions letting a vortex_admin profile act as another profile. The raw
// token is never stored: lookup is by SHA-256 hash, so a session is revocable instantly.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("admin_impersonation_sessions", {
    actor_profile_id: {
      allowNull: false,
      // RESTRICT: an impersonation record must not disappear with the operator who made it.
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    expires_at: {
      allowNull: false,
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    last_used_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    revoked_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    revoked_reason: {
      allowNull: true,
      type: DataTypes.STRING(100)
    },
    target_profile_id: {
      allowNull: false,
      // RESTRICT: the target is part of the security audit record and must not erase it.
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    token_hash: {
      allowNull: false,
      type: DataTypes.CHAR(64)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addIndex("admin_impersonation_sessions", ["token_hash"], {
    name: "uq_admin_impersonation_sessions_token_hash",
    unique: true
  });
  await queryInterface.addIndex("admin_impersonation_sessions", ["target_profile_id"], {
    name: "idx_admin_impersonation_sessions_target"
  });
  await queryInterface.addIndex("admin_impersonation_sessions", ["actor_profile_id", "created_at"], {
    name: "idx_admin_impersonation_sessions_actor_created"
  });
  // Enforces one non-revoked session per actor/target even if application locking regresses.
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX "uq_admin_impersonation_sessions_active"
     ON "admin_impersonation_sessions" ("actor_profile_id", "target_profile_id")
     WHERE "revoked_at" IS NULL;`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "admin_impersonation_sessions"
     ADD CONSTRAINT "chk_admin_impersonation_sessions_distinct" CHECK (actor_profile_id <> target_profile_id);`
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("admin_impersonation_sessions");
}
