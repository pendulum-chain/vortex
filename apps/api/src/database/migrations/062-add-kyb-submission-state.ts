import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  const [duplicateCases] = await queryInterface.sequelize.query(
    `SELECT provider_customer_id
     FROM kyc_cases
     WHERE provider = 'avenia' AND provider_customer_id IS NOT NULL
     GROUP BY provider_customer_id
     HAVING COUNT(*) > 1
     LIMIT 1`
  );
  if (Array.isArray(duplicateCases) && duplicateCases.length > 0) {
    throw new Error("Cannot enforce one Avenia KYC case per provider customer while duplicate rows exist");
  }

  await queryInterface.addColumn("kyc_cases", "submission_status", {
    allowNull: false,
    defaultValue: "not_started",
    type: DataTypes.STRING(16)
  });
  await queryInterface.addColumn("kyc_cases", "submission_request_hash", {
    allowNull: true,
    type: DataTypes.STRING(64)
  });
  await queryInterface.addColumn("kyc_cases", "submission_started_at", {
    allowNull: true,
    type: DataTypes.DATE
  });
  await queryInterface.sequelize.query(
    "UPDATE kyc_cases SET submission_status = 'submitted' WHERE provider_case_id IS NOT NULL"
  );
  await queryInterface.addConstraint("kyc_cases", {
    fields: ["submission_status"],
    name: "kyc_cases_submission_status_check",
    type: "check",
    where: { submission_status: ["not_started", "submitting", "submitted", "unknown"] }
  });
  await queryInterface.addIndex("kyc_cases", ["provider_customer_id"], {
    name: "uniq_kyc_cases_avenia_provider_customer",
    unique: true,
    where: { provider: "avenia" }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("kyc_cases", "uniq_kyc_cases_avenia_provider_customer");
  await queryInterface.removeConstraint("kyc_cases", "kyc_cases_submission_status_check");
  await queryInterface.removeColumn("kyc_cases", "submission_started_at");
  await queryInterface.removeColumn("kyc_cases", "submission_request_hash");
  await queryInterface.removeColumn("kyc_cases", "submission_status");
}
