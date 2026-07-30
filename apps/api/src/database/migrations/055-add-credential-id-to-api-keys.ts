import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("api_keys", "credential_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("api_keys", ["credential_id"], {
    name: "idx_api_keys_credential_id"
  });

  // Backfill only names that identify exactly one public and one secret key for an owner.
  // Duplicate names remain unpaired so revocation never guesses at a relationship.
  await queryInterface.sequelize.query(`
    WITH normalized AS (
      SELECT
        id,
        user_id,
        partner_id,
        partner_name,
        key_type,
        CASE
          WHEN name IN ('Public Key', 'Secret Key') THEN 'API Key'
          ELSE regexp_replace(COALESCE(name, ''), '\\s*\\((Public|Secret)\\)$', '', 'i')
        END AS base_name
      FROM api_keys
      WHERE credential_id IS NULL
    ), unambiguous_pairs AS (
      SELECT
        user_id,
        partner_id,
        partner_name,
        base_name,
        (MAX(id::text) FILTER (WHERE key_type = 'public'))::uuid AS public_id,
        (MAX(id::text) FILTER (WHERE key_type = 'secret'))::uuid AS secret_id,
        uuid_generate_v4() AS credential_id
      FROM normalized
      GROUP BY user_id, partner_id, partner_name, base_name
      HAVING COUNT(*) FILTER (WHERE key_type = 'public') = 1
        AND COUNT(*) FILTER (WHERE key_type = 'secret') = 1
        AND COUNT(*) = 2
    ), assignments AS (
      SELECT public_id AS key_id, credential_id FROM unambiguous_pairs
      UNION ALL
      SELECT secret_id AS key_id, credential_id FROM unambiguous_pairs
    )
    UPDATE api_keys AS keys
    SET credential_id = assignments.credential_id
    FROM assignments
    WHERE keys.id = assignments.key_id;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("api_keys", "idx_api_keys_credential_id");
  await queryInterface.removeColumn("api_keys", "credential_id");
}
