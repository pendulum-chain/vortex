import { QueryInterface } from "sequelize";

// Final contract step for the unified-schema rollout. This migration is intentionally
// irreversible: the removed tables are stale snapshots and cannot be reconstructed.
export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await queryInterface.sequelize.query("SET LOCAL lock_timeout = '5s';", { transaction });

    // Deleted-partner keys must be explicitly revoked before partner_name stops acting
    // as their origin marker.
    await queryInterface.sequelize.query(
      `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM api_keys
          WHERE partner_name IS NOT NULL
            AND partner_id IS NULL
            AND is_active
        ) THEN
          RAISE EXCEPTION 'Cannot drop api_keys.partner_name while active orphaned partner keys remain';
        END IF;
      END
      $$;`,
      { transaction }
    );

    // Do not discard the directional backup columns if an assignment was not moved to
    // the canonical partner_id column.
    await queryInterface.sequelize.query(
      `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM profile_partner_assignments
          WHERE partner_id IS NULL
            AND (buy_partner_id IS NOT NULL OR sell_partner_id IS NOT NULL)
        ) THEN
          RAISE EXCEPTION 'Cannot drop legacy assignment columns while unmigrated partner references remain';
        END IF;
      END
      $$;`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_api_keys_partner_name;
      DROP INDEX IF EXISTS idx_profile_partner_assignments_buy_partner;
      DROP INDEX IF EXISTS idx_profile_partner_assignments_sell_partner;
      DROP INDEX IF EXISTS idx_partners_name_ramp_type;

      ALTER TABLE api_keys
        DROP COLUMN IF EXISTS partner_name;

      ALTER TABLE profile_partner_assignments
        DROP COLUMN IF EXISTS buy_partner_id,
        DROP COLUMN IF EXISTS sell_partner_id;

      DROP TABLE IF EXISTS partners_legacy;

      ALTER TABLE partners
        DROP COLUMN IF EXISTS ramp_type,
        DROP COLUMN IF EXISTS markup_type,
        DROP COLUMN IF EXISTS markup_value,
        DROP COLUMN IF EXISTS markup_currency,
        DROP COLUMN IF EXISTS vortex_fee_type,
        DROP COLUMN IF EXISTS vortex_fee_value,
        DROP COLUMN IF EXISTS target_discount,
        DROP COLUMN IF EXISTS max_subsidy,
        DROP COLUMN IF EXISTS min_dynamic_difference,
        DROP COLUMN IF EXISTS max_dynamic_difference,
        DROP COLUMN IF EXISTS payout_address_substrate,
        DROP COLUMN IF EXISTS payout_address_evm;

      DROP TABLE IF EXISTS mykobo_customers;
      DROP TABLE IF EXISTS alfredpay_customers;
      DROP TABLE IF EXISTS kyc_level_2;
      DROP TABLE IF EXISTS tax_ids;

      DROP TYPE IF EXISTS enum_mykobo_customers_status;
      DROP TYPE IF EXISTS enum_mykobo_customers_type;
      DROP TYPE IF EXISTS enum_alfredpay_customers_country;
      DROP TYPE IF EXISTS enum_alfredpay_customers_status;
      DROP TYPE IF EXISTS enum_alfredpay_customers_type;
      DROP TYPE IF EXISTS enum_kyc_level_2_document_type;
      DROP TYPE IF EXISTS enum_kyc_level_2_status;
      DROP TYPE IF EXISTS enum_tax_ids_account_type;
      DROP TYPE IF EXISTS enum_tax_ids_internal_status;
      DROP TYPE IF EXISTS enum_partners_markup_type;
      DROP TYPE IF EXISTS enum_partners_vortex_fee_type;`,
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(): Promise<void> {
  throw new Error("060-drop-legacy-schema is irreversible; restore a pre-migration database backup instead");
}
