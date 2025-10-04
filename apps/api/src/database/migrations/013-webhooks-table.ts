import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create webhooks table
  await queryInterface.createTable("webhooks", {
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE
    },
    events: {
      allowNull: false,
      defaultValue: ["TRANSACTION_CREATED", "STATUS_CHANGE"],
      type: DataTypes.ARRAY(DataTypes.STRING)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    secret: {
      allowNull: false,
      type: DataTypes.STRING(255)
    },
    sessionId: {
      allowNull: true,
      field: "session_id",
      type: DataTypes.STRING(255)
    },
    transactionId: {
      allowNull: true,
      field: "transaction_id",
      type: DataTypes.UUID
    },
    updatedAt: {
      allowNull: false,
      field: "updated_at",
      type: DataTypes.DATE
    },
    url: {
      allowNull: false,
      type: DataTypes.STRING(500),
      validate: {
        isUrl: true
      }
    }
  });

  // Add foreign key constraint
  await queryInterface.addConstraint("webhooks", {
    fields: ["transaction_id"],
    name: "fk_webhooks_transaction_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "ramp_states"
    },
    type: "foreign key"
  });

  // Create indexes for efficient querying
  await queryInterface.addIndex("webhooks", ["transaction_id"], {
    name: "idx_webhooks_transaction_id"
  });

  await queryInterface.addIndex("webhooks", ["session_id"], {
    name: "idx_webhooks_session_id"
  });

  await queryInterface.addIndex("webhooks", ["is_active"], {
    name: "idx_webhooks_active"
  });

  // Composite index for efficient event filtering
  await queryInterface.addIndex("webhooks", ["is_active", "events"], {
    name: "idx_webhooks_active_events"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop indexes
  await queryInterface.removeIndex("webhooks", "idx_webhooks_transaction_id");
  await queryInterface.removeIndex("webhooks", "idx_webhooks_session_id");
  await queryInterface.removeIndex("webhooks", "idx_webhooks_active");
  await queryInterface.removeIndex("webhooks", "idx_webhooks_active_events");

  // Remove foreign key constraint
  await queryInterface.removeConstraint("webhooks", "fk_webhooks_transaction_id");

  // Drop table
  await queryInterface.dropTable("webhooks");
}
