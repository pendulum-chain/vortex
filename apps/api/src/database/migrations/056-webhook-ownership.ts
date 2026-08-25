import { DataTypes, QueryInterface } from "sequelize";

// Webhooks previously had no owner: any authenticated API key could subscribe to any
// quote's events and delete any webhook by UUID (security spec SPEC-001). Each webhook
// now records the principal that registered it — the partner behind a partner-scoped
// secret key, or the user behind a user-scoped secret key.
//
// Rows created before this migration have no recoverable owner. Rather than grandfather
// them (which would keep the cross-tenant hole open for exactly the rows an attacker
// could have planted pre-deployment), they are deleted: there are no production webhook
// registrations, so this is a no-op there and only clears dev/staging leftovers.
// The CHECK constraint then makes an ownerless row unrepresentable going forward, so the
// delivery matcher never has to special-case one.
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

  // Every pre-existing row is ownerless by construction (the columns did not exist).
  await queryInterface.sequelize.query("DELETE FROM webhooks;");

  await queryInterface.sequelize.query(`
    ALTER TABLE webhooks
    ADD CONSTRAINT chk_webhooks_exactly_one_owner
    CHECK (num_nonnulls(partner_id, user_id) = 1);
  `);

  await queryInterface.addIndex("webhooks", ["partner_id"], { name: "idx_webhooks_partner_id" });
  await queryInterface.addIndex("webhooks", ["user_id"], { name: "idx_webhooks_user_id" });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("webhooks", "idx_webhooks_user_id");
  await queryInterface.removeIndex("webhooks", "idx_webhooks_partner_id");
  await queryInterface.sequelize.query("ALTER TABLE webhooks DROP CONSTRAINT IF EXISTS chk_webhooks_exactly_one_owner;");
  await queryInterface.removeColumn("webhooks", "user_id");
  await queryInterface.removeColumn("webhooks", "partner_id");
}
