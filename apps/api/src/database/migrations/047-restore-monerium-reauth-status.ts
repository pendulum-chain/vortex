import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    WITH latest_case AS (
      SELECT DISTINCT ON (provider_customer_id)
        provider_customer_id, status, status_external
      FROM kyc_cases
      WHERE provider = 'monerium' AND provider_customer_id IS NOT NULL
      ORDER BY provider_customer_id, updated_at DESC
    )
    UPDATE provider_customers pc
    SET status = latest_case.status,
        status_external = latest_case.status_external,
        updated_at = NOW()
    FROM latest_case
    WHERE pc.id = latest_case.provider_customer_id
      AND pc.provider = 'monerium'
      AND pc.provider_customer_id IS NOT NULL
      AND pc.status = 'started'
      AND pc.status_external = 'authorization_started';
  `);
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Restoring stale authorization_started statuses would reintroduce the broken state.
}
