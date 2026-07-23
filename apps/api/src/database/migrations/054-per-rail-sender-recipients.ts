import { DataTypes, QueryInterface } from "sequelize";

// One sender↔recipient relationship per payout rail. The previous UNIQUE(sender, recipient)
// forced a single row per pair, so accepting an invite on a second rail repointed the row's
// invitation_id and silently dropped the first corridor (list entry and its transfer
// eligibility both key off the linked invitation). rail is backfilled from the linked
// invitation; legacy rows without one keep NULL, folded to '*' in the unique index.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("sender_recipients", "rail", {
    allowNull: true,
    type: DataTypes.STRING(8)
  });

  await queryInterface.sequelize.query(`
    UPDATE sender_recipients sr SET rail = ri.rail
    FROM recipient_invitations ri
    WHERE sr.invitation_id = ri.id;
  `);

  await queryInterface.removeConstraint("sender_recipients", "uniq_sender_recipients_pair").catch(async () => {
    // Depending on environment history the pair uniqueness exists as an index, not a constraint.
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS uniq_sender_recipients_pair;");
  });
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uniq_sender_recipients_pair_rail
    ON sender_recipients (sender_customer_entity_id, recipient_customer_entity_id, COALESCE(rail, '*'));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Best-effort: multi-rail rows cannot exist under the old pair uniqueness — keep the
  // oldest row per pair and drop the rest before restoring it.
  await queryInterface.sequelize.query(`
    DELETE FROM sender_recipients sr
    WHERE sr.id NOT IN (
      SELECT DISTINCT ON (sender_customer_entity_id, recipient_customer_entity_id) id
      FROM sender_recipients
      ORDER BY sender_customer_entity_id, recipient_customer_entity_id, created_at ASC, id ASC
    );
  `);
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS uniq_sender_recipients_pair_rail;");
  await queryInterface.addConstraint("sender_recipients", {
    fields: ["sender_customer_entity_id", "recipient_customer_entity_id"],
    name: "uniq_sender_recipients_pair",
    type: "unique"
  });
  await queryInterface.removeColumn("sender_recipients", "rail");
}
