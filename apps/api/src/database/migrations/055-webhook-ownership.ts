import { DataTypes, QueryInterface } from "sequelize";

// Webhooks previously had no owner: any authenticated API key could subscribe to any
// quote's events and delete any webhook by UUID (security spec SPEC-001). Each webhook
// now records the principal that registered it — the partner behind a partner-scoped
// secret key, or the user behind a user-scoped secret key. Pre-existing rows keep NULL
// owners; they continue to deliver but can no longer be managed through the API.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("webhooks", "partner_id", {
    allowNull: true,
    references: {
      key: "id",
      model: "partners"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addColumn("webhooks", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("webhooks", ["partner_id"], { name: "idx_webhooks_partner_id" });
  await queryInterface.addIndex("webhooks", ["user_id"], { name: "idx_webhooks_user_id" });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("webhooks", "idx_webhooks_user_id");
  await queryInterface.removeIndex("webhooks", "idx_webhooks_partner_id");
  await queryInterface.removeColumn("webhooks", "user_id");
  await queryInterface.removeColumn("webhooks", "partner_id");
}
