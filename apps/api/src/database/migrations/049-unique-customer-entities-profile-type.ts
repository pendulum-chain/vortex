import { QueryInterface } from "sequelize";

// Adds the uniqueness the code already assumes: getOrCreateCustomerEntityForProfile and
// invite acceptance findOrCreate on (profile_id, type) are only race-safe when the database
// enforces one entity per profile and type. Multiple entity *types* per profile stay allowed
// (plan D4 — individual + business); only duplicate rows of the same type are precluded.
//
// Duplicates could only have been created by that findOrCreate race. Unreferenced duplicates
// (keeping the oldest row per group) are removed; a *referenced* duplicate makes the index
// creation fail loudly for manual repair rather than silently merging compliance anchors.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DELETE FROM customer_entities ce
    USING customer_entities keeper
    WHERE ce.profile_id IS NOT NULL
      AND keeper.profile_id = ce.profile_id
      AND keeper.type = ce.type
      AND (keeper.created_at, keeper.id) < (ce.created_at, ce.id)
      AND NOT EXISTS (SELECT 1 FROM provider_customers t WHERE t.customer_entity_id = ce.id)
      AND NOT EXISTS (SELECT 1 FROM kyc_cases t WHERE t.customer_entity_id = ce.id)
      AND NOT EXISTS (SELECT 1 FROM notifications t WHERE t.customer_entity_id = ce.id)
      AND NOT EXISTS (SELECT 1 FROM recipient_invitations t WHERE t.sender_customer_entity_id = ce.id)
      AND NOT EXISTS (
        SELECT 1 FROM sender_recipients t
        WHERE t.sender_customer_entity_id = ce.id OR t.recipient_customer_entity_id = ce.id
      )
      AND NOT EXISTS (SELECT 1 FROM recipient_payout_references t WHERE t.recipient_customer_entity_id = ce.id);
  `);

  // Partial: profile_id is nullable by design (compliance records outlive a deleted profile),
  // and orphaned rows must not collide with each other.
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX "uq_customer_entities_profile_id_type"
    ON "customer_entities" (profile_id, type)
    WHERE profile_id IS NOT NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "uq_customer_entities_profile_id_type";`);
}
