import { QueryInterface } from "sequelize";

const CANONICAL_STATUSES = "'pending', 'started', 'in_review', 'approved', 'rejected'";
const PREVIOUS_STATUSES = "'pending', 'in_review', 'approved', 'rejected'";

async function replaceStatusConstraints(queryInterface: QueryInterface, statuses: string): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE "provider_customers" DROP CONSTRAINT "chk_provider_customers_status";
    ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_status"
      CHECK (status IN (${statuses}));
    ALTER TABLE "kyc_cases" DROP CONSTRAINT "chk_kyc_cases_status";
    ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_status"
      CHECK (status IN (${statuses}));
  `);
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  await replaceStatusConstraints(queryInterface, CANONICAL_STATUSES);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    UPDATE "provider_customers" SET status = 'pending' WHERE status = 'started';
    UPDATE "kyc_cases" SET status = 'pending' WHERE status = 'started';
  `);
  await replaceStatusConstraints(queryInterface, PREVIOUS_STATUSES);
}
