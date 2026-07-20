import { DataTypes, QueryInterface } from "sequelize";

const CANONICAL_STATUSES = "'pending', 'started', 'in_review', 'approved', 'rejected'";
const LEGACY_STATUSES =
  "'CONSULTED', 'PENDING', 'APPROVED', 'REJECTED', 'LINK_OPENED', 'USER_COMPLETED', 'VERIFYING', 'FAILED', 'SUCCESS', 'UPDATE_REQUIRED', 'Consulted', 'Requested', 'Accepted', 'Rejected'";

async function dropStatusConstraints(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE "provider_customers" DROP CONSTRAINT "chk_provider_customers_status";
    ALTER TABLE "kyc_cases" DROP CONSTRAINT "chk_kyc_cases_status";
  `);
}

async function addStatusConstraints(queryInterface: QueryInterface, statuses: string): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_status"
      CHECK (status IN (${statuses}));
    ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_status"
      CHECK (status IN (${statuses}));
  `);
}

const canonicalStatusSql = `CASE
  WHEN status IN ('APPROVED', 'SUCCESS', 'Accepted') THEN 'approved'
  WHEN status IN ('REJECTED', 'FAILED', 'Rejected') THEN 'rejected'
  WHEN status IN ('USER_COMPLETED', 'VERIFYING', 'Requested') THEN 'in_review'
  WHEN provider = 'avenia' AND status = 'Consulted' THEN 'started'
  WHEN provider = 'alfredpay' AND status IN ('CONSULTED', 'LINK_OPENED', 'UPDATE_REQUIRED') THEN 'started'
  WHEN provider = 'monerium' AND status = 'PENDING'
    AND LOWER(COALESCE(status_external, '')) IN ('authorization_started', 'created', 'incomplete') THEN 'started'
  WHEN provider = 'monerium' AND status = 'PENDING' AND COALESCE(status_external, '') = '' THEN 'pending'
  WHEN status = 'PENDING' THEN 'in_review'
  ELSE 'pending'
END`;

const legacyStatusSql = `CASE provider
  WHEN 'avenia' THEN CASE status
    WHEN 'approved' THEN 'Accepted'
    WHEN 'rejected' THEN 'Rejected'
    WHEN 'in_review' THEN 'Requested'
    WHEN 'started' THEN 'Consulted'
    ELSE 'Consulted'
  END
  WHEN 'alfredpay' THEN CASE status
    WHEN 'approved' THEN 'SUCCESS'
    WHEN 'rejected' THEN 'FAILED'
    WHEN 'in_review' THEN 'VERIFYING'
    WHEN 'started' THEN 'CONSULTED'
    ELSE 'CONSULTED'
  END
  WHEN 'monerium' THEN CASE status
    WHEN 'approved' THEN 'APPROVED'
    WHEN 'rejected' THEN 'REJECTED'
    ELSE 'PENDING'
  END
  ELSE CASE status
    WHEN 'approved' THEN 'APPROVED'
    WHEN 'rejected' THEN 'REJECTED'
    WHEN 'in_review' THEN 'PENDING'
    ELSE 'CONSULTED'
  END
END`;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("provider_customers", "company_name", {
    allowNull: true,
    type: DataTypes.STRING(255)
  });
  await dropStatusConstraints(queryInterface);
  await queryInterface.sequelize.query(`UPDATE "provider_customers" SET status = ${canonicalStatusSql};`);
  await queryInterface.sequelize.query(`UPDATE "kyc_cases" SET status = ${canonicalStatusSql};`);
  await addStatusConstraints(queryInterface, CANONICAL_STATUSES);
  await queryInterface.removeColumn("provider_customers", "tax_reference_masked");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("provider_customers", "tax_reference_masked", {
    allowNull: true,
    type: DataTypes.STRING(64)
  });
  await queryInterface.sequelize.query(`
    UPDATE "provider_customers"
    SET tax_reference_masked = repeat('*', GREATEST(length(tax_reference) - 4, 0)) || right(tax_reference, 4)
    WHERE tax_reference IS NOT NULL;
  `);
  await dropStatusConstraints(queryInterface);
  await queryInterface.sequelize.query(`UPDATE "provider_customers" SET status = ${legacyStatusSql};`);
  await queryInterface.sequelize.query(`UPDATE "kyc_cases" SET status = ${legacyStatusSql};`);
  await addStatusConstraints(queryInterface, LEGACY_STATUSES);
  await queryInterface.removeColumn("provider_customers", "company_name");
}
