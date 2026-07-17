import { DataTypes, QueryInterface } from "sequelize";

// Adds the partner_id FK to api_keys (backfilled from the partner_name string against the
// now-unique partners.name — depends on 039), plus the target-schema scopes/revoked_at
// columns. partner_name is kept as an unread backup column (no dual-write, not dropped).
// Note: the schema doc's profile_id already exists as api_keys.user_id (migration 034).
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("api_keys", "partner_id", {
    allowNull: true,
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "partners"
    },
    type: DataTypes.UUID
  });
  await queryInterface.addColumn("api_keys", "scopes", {
    allowNull: true,
    type: DataTypes.JSONB
  });
  await queryInterface.addColumn("api_keys", "revoked_at", {
    allowNull: true,
    type: DataTypes.DATE
  });

  await queryInterface.addIndex("api_keys", ["partner_id"], {
    name: "idx_api_keys_partner_id"
  });

  // Backfill: names are unique after 039, so the mapping is unambiguous. Keys whose
  // partner_name matches no partners row keep partner_id NULL — they were already unusable
  // (name lookup found nothing) and stay unusable, same behavior.
  await queryInterface.sequelize.query(`
    UPDATE api_keys k SET partner_id = p.id
    FROM partners p
    WHERE k.partner_name IS NOT NULL
      AND p.name = k.partner_name
      AND k.partner_id IS NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("api_keys", "idx_api_keys_partner_id");
  await queryInterface.removeColumn("api_keys", "revoked_at");
  await queryInterface.removeColumn("api_keys", "scopes");
  await queryInterface.removeColumn("api_keys", "partner_id");
}
