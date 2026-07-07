import { DataTypes, QueryInterface } from "sequelize";

// In-app notification feed + per-profile preferences (plan §8 — dashboard need beyond the
// architecture docs).
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("notifications", {
    body: {
      allowNull: true,
      type: DataTypes.TEXT
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    customer_entity_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    metadata: {
      allowNull: true,
      defaultValue: {},
      type: DataTypes.JSONB
    },
    profile_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    read_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    title: {
      allowNull: false,
      type: DataTypes.STRING(255)
    },
    type: {
      allowNull: false,
      type: DataTypes.STRING(64)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("notifications", {
    fields: ["profile_id"],
    name: "fk_notifications_profile_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("notifications", {
    fields: ["customer_entity_id"],
    name: "fk_notifications_customer_entity_id",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.addIndex("notifications", ["profile_id", "created_at"], {
    name: "idx_notifications_profile_created"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;`);

  await queryInterface.createTable("notification_preferences", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    email_enabled: {
      allowNull: false,
      defaultValue: true,
      type: DataTypes.BOOLEAN
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    prefs: {
      allowNull: false,
      defaultValue: {},
      type: DataTypes.JSONB
    },
    profile_id: {
      allowNull: false,
      type: DataTypes.UUID,
      unique: true
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("notification_preferences", {
    fields: ["profile_id"],
    name: "fk_notification_preferences_profile_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;`);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("notification_preferences");
  await queryInterface.dropTable("notifications");
}
