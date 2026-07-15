import { QueryInterface } from "sequelize";

const PROVIDERS_WITH_MONERIUM = "'mykobo', 'alfredpay', 'avenia', 'monerium'";
const ORIGINAL_PROVIDERS = "'mykobo', 'alfredpay', 'avenia'";

async function replaceProviderConstraints(queryInterface: QueryInterface, providers: string): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE "provider_customers" DROP CONSTRAINT "chk_provider_customers_provider";
    ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_provider"
      CHECK (provider IN (${providers}));
    ALTER TABLE "kyc_cases" DROP CONSTRAINT "chk_kyc_cases_provider";
    ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_provider"
      CHECK (provider IN (${providers}));
  `);
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  await replaceProviderConstraints(queryInterface, PROVIDERS_WITH_MONERIUM);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM "provider_customers" WHERE provider = 'monerium'
     UNION ALL SELECT 1 FROM "kyc_cases" WHERE provider = 'monerium' LIMIT 1;`
  );
  if (rows.length > 0) {
    throw new Error("Cannot remove Monerium provider constraints while Monerium records exist");
  }
  await replaceProviderConstraints(queryInterface, ORIGINAL_PROVIDERS);
}
