import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("profiles", "active_customer_entity_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.addConstraint("profiles", {
    fields: ["active_customer_entity_id"],
    name: "fk_profiles_active_customer_entity_id",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });

  await queryInterface.addIndex("profiles", ["active_customer_entity_id"], {
    name: "idx_profiles_active_customer_entity_id"
  });

  // Preserve an unambiguous entity that already has provider data. Empty legacy individual
  // entities were created automatically and must not prevent an existing user choosing company.
  await queryInterface.sequelize.query(`
    UPDATE profiles p
    SET active_customer_entity_id = candidate.id,
        updated_at = NOW()
    FROM (
      SELECT profile_id, MIN(id::text)::uuid AS id
      FROM customer_entities
      WHERE profile_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM provider_customers pc WHERE pc.customer_entity_id = customer_entities.id)
          OR EXISTS (
            SELECT 1 FROM recipient_invitations ri WHERE ri.sender_customer_entity_id = customer_entities.id
          )
          OR EXISTS (
            SELECT 1 FROM sender_recipients sr
            WHERE sr.sender_customer_entity_id = customer_entities.id
               OR sr.recipient_customer_entity_id = customer_entities.id
          )
          OR EXISTS (
            SELECT 1 FROM recipient_payout_references rpr
            WHERE rpr.recipient_customer_entity_id = customer_entities.id
          )
        )
      GROUP BY profile_id
      HAVING COUNT(*) = 1 AND BOOL_AND(status = 'active')
    ) candidate
    WHERE p.id = candidate.profile_id
      AND p.active_customer_entity_id IS NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("profiles", "idx_profiles_active_customer_entity_id");
  await queryInterface.removeConstraint("profiles", "fk_profiles_active_customer_entity_id");
  await queryInterface.removeColumn("profiles", "active_customer_entity_id");
}
