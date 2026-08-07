import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("financial_operations", {
    attempt_class: { allowNull: false, type: DataTypes.STRING(64) },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    error_message: { allowNull: true, type: DataTypes.STRING(500) },
    external_id: { allowNull: true, type: DataTypes.STRING(255) },
    flow_id: { allowNull: false, type: DataTypes.STRING(128) },
    flow_version: { allowNull: false, type: DataTypes.INTEGER },
    id: { allowNull: false, defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    operation_key: { allowNull: false, type: DataTypes.STRING(64), unique: true },
    phase: { allowNull: false, type: DataTypes.STRING(64) },
    provider: { allowNull: false, type: DataTypes.STRING(64) },
    request_hash: { allowNull: false, type: DataTypes.STRING(64) },
    response: { allowNull: true, type: DataTypes.JSONB },
    scope_id: { allowNull: false, type: DataTypes.STRING(128) },
    scope_type: { allowNull: false, type: DataTypes.STRING(16) },
    status: { allowNull: false, type: DataTypes.STRING(16) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
  });
  await queryInterface.addIndex("financial_operations", ["scope_type", "scope_id"], {
    name: "idx_financial_operations_scope"
  });
  await queryInterface.addIndex("financial_operations", ["status", "updated_at"], {
    name: "idx_financial_operations_status_updated"
  });
  await queryInterface.addConstraint("financial_operations", {
    fields: ["scope_type"],
    name: "financial_operations_scope_type_check",
    type: "check",
    where: { scope_type: ["quote", "ramp"] }
  });
  await queryInterface.addConstraint("financial_operations", {
    fields: ["status"],
    name: "financial_operations_status_check",
    type: "check",
    where: { status: ["not_started", "submitted", "confirmed", "failed", "unknown"] }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("financial_operations");
}
