import { QueryInterface } from "sequelize";

// Final contract step for the unified credential rollout. This migration is
// irreversible because legacy key material cannot be reconstructed.
export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await queryInterface.sequelize.query("SET LOCAL lock_timeout = '5s';", { transaction });
    await queryInterface.sequelize.query(
      `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM api_keys
          WHERE is_active
        ) THEN
          RAISE EXCEPTION 'Cannot drop api_keys while active legacy keys remain';
        END IF;
      END
      $$;

      DROP TABLE api_keys;
      DROP TYPE IF EXISTS enum_api_keys_key_type;`,
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(): Promise<void> {
  throw new Error("061-drop-legacy-api-keys is irreversible; restore a pre-migration database backup instead");
}
