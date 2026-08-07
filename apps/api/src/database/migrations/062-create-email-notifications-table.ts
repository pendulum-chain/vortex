import { DataTypes, QueryInterface } from "sequelize";

// Named `email_notifications`, not `notifications`: migration 043 already owns the
// `notifications` table for in-app notifications. This is the outbound-email queue.

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("email_notifications", {
    attempts: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.INTEGER
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastError: {
      allowNull: true,
      field: "last_error",
      type: DataTypes.TEXT
    },
    locale: {
      allowNull: false,
      type: DataTypes.STRING(10)
    },
    nextAttemptAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "next_attempt_at",
      type: DataTypes.DATE
    },
    payload: {
      allowNull: false,
      defaultValue: {},
      type: DataTypes.JSONB
    },
    // Kept as a plain string rather than an enum so a new upstream provider
    // (Alfredpay) can be added without an ALTER TYPE migration.
    provider: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    providerMessageId: {
      allowNull: true,
      field: "provider_message_id",
      type: DataTypes.STRING(255)
    },
    // Identifier of the upstream thing this notification is about (ramp id, KYB attempt id).
    // NOT NULL together with provider/type so the dedupe index below actually holds:
    // Postgres treats NULLs as distinct, so a nullable member would silently disable it.
    resourceId: {
      allowNull: false,
      field: "resource_id",
      type: DataTypes.STRING(255)
    },
    sentAt: {
      allowNull: true,
      field: "sent_at",
      type: DataTypes.DATE
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.STRING(16)
    },
    type: {
      allowNull: false,
      type: DataTypes.STRING(64)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: false,
      field: "user_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    }
  });

  await queryInterface.addIndex("email_notifications", ["provider", "type", "resource_id"], {
    name: "uniq_email_notifications_provider_type_resource",
    unique: true
  });

  await queryInterface.addIndex("email_notifications", ["status", "next_attempt_at"], {
    name: "idx_email_notifications_dispatch"
  });

  await queryInterface.addIndex("email_notifications", ["user_id"], {
    name: "idx_email_notifications_user_id"
  });

  // Tombstone every ramp that completed before this table existed. The hourly
  // reconciliation sweep re-enqueues any completed ramp without a row here, so an
  // empty table on first deploy would mass-mail the entire history of completions.
  await queryInterface.sequelize.query(`
    INSERT INTO email_notifications
      (id, provider, type, user_id, resource_id, locale, payload, status, attempts, next_attempt_at, last_error, created_at, updated_at)
    SELECT
      uuid_generate_v4(), 'vortex', 'ramp_completed', user_id, id::text, 'en-US', '{}'::jsonb,
      'skipped', 0, NOW(), 'Backfilled at table creation: ramp completed before email notifications existed', NOW(), NOW()
    FROM ramp_states
    WHERE current_phase = 'complete' AND user_id IS NOT NULL
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("email_notifications", "idx_email_notifications_user_id");
  await queryInterface.removeIndex("email_notifications", "idx_email_notifications_dispatch");
  await queryInterface.removeIndex("email_notifications", "uniq_email_notifications_provider_type_resource");
  await queryInterface.dropTable("email_notifications");
}
