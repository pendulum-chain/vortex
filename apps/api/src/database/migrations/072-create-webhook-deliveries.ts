import { DataTypes, QueryInterface } from "sequelize";

// Durable webhook delivery outbox for the account-scoped event family: a row per
// (webhook, event) is enqueued before any send, dispatched by a worker with backoff,
// and deduplicated by the unique pair so crashes and re-emits never double-deliver.
// The legacy quote-scoped transaction events keep their in-process delivery path.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("webhook_deliveries", {
    attempts: { allowNull: false, defaultValue: 0, type: DataTypes.INTEGER },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    event_id: { allowNull: false, type: DataTypes.STRING(128) },
    event_type: { allowNull: false, type: DataTypes.STRING(64) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    last_error: { allowNull: true, type: DataTypes.TEXT },
    next_attempt_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    payload: { allowNull: false, type: DataTypes.JSONB },
    sent_at: { allowNull: true, type: DataTypes.DATE },
    status: { allowNull: false, defaultValue: "pending", type: DataTypes.STRING(16) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    webhook_id: {
      allowNull: false,
      onDelete: "CASCADE",
      references: { key: "id", model: "webhooks" },
      type: DataTypes.UUID
    }
  });
  await queryInterface.addConstraint("webhook_deliveries", {
    fields: ["webhook_id", "event_id"],
    name: "uniq_webhook_deliveries_webhook_event",
    type: "unique"
  });
  await queryInterface.addIndex("webhook_deliveries", ["status", "next_attempt_at"]);
  await queryInterface.sequelize.query(
    `ALTER TABLE webhook_deliveries ADD CONSTRAINT chk_webhook_deliveries_status
     CHECK (status IN ('pending', 'sending', 'sent', 'abandoned'))`
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("webhook_deliveries", {});
}
