import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("api_client_events", {
    api_key_prefix: { allowNull: true, type: DataTypes.STRING(16) },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    duration_ms: { allowNull: true, type: DataTypes.INTEGER },
    error_message: { allowNull: true, type: DataTypes.STRING(300) },
    error_type: { allowNull: true, type: DataTypes.STRING(64) },
    http_status: { allowNull: true, type: DataTypes.INTEGER },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    metadata: { allowNull: true, type: DataTypes.JSONB },
    network: { allowNull: true, type: DataTypes.STRING(32) },
    operation: { allowNull: false, type: DataTypes.STRING(64) },
    partner_id: { allowNull: true, type: DataTypes.UUID },
    partner_name: { allowNull: true, type: DataTypes.STRING(100) },
    payment_method: { allowNull: true, type: DataTypes.STRING(32) },
    quote_id: { allowNull: true, type: DataTypes.UUID },
    ramp_id: { allowNull: true, type: DataTypes.UUID },
    ramp_type: { allowNull: true, type: DataTypes.STRING(16) },
    request_id: { allowNull: true, type: DataTypes.STRING(128) },
    status: { allowNull: false, type: DataTypes.STRING(16) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    user_id: { allowNull: true, type: DataTypes.UUID }
  });

  await queryInterface.addIndex("api_client_events", {
    fields: [{ name: "created_at", order: "DESC" }],
    name: "idx_api_client_events_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["partner_id", "created_at"], {
    name: "idx_api_client_events_partner_id_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["partner_name", "created_at"], {
    name: "idx_api_client_events_partner_name_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["operation", "created_at"], {
    name: "idx_api_client_events_operation_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["status", "created_at"], {
    name: "idx_api_client_events_status_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["error_type", "created_at"], {
    name: "idx_api_client_events_error_type_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["api_key_prefix", "created_at"], {
    name: "idx_api_client_events_api_key_prefix_created_at"
  });
  await queryInterface.addIndex("api_client_events", ["request_id"], { name: "idx_api_client_events_request_id" });
  await queryInterface.addIndex("api_client_events", ["quote_id"], { name: "idx_api_client_events_quote_id" });
  await queryInterface.addIndex("api_client_events", ["ramp_id"], { name: "idx_api_client_events_ramp_id" });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("api_client_events");
}
