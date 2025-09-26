import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Drop and recreate everything in one go
  await queryInterface.sequelize.query(`
    -- Drop the table if it exists
    DROP TABLE IF EXISTS tax_ids CASCADE;

    -- Drop the enum type if it exists
    DROP TYPE IF EXISTS enum_tax_ids_account_type CASCADE;

    -- Create the new enum type with correct values
    CREATE TYPE enum_tax_ids_account_type AS ENUM('INDIVIDUAL', 'COMPANY');

    -- Create the new table with the correct column name and enum type
    CREATE TABLE tax_ids (
      "taxId" VARCHAR(255) PRIMARY KEY,
      sub_account_id VARCHAR(255) NOT NULL,
      account_type enum_tax_ids_account_type NOT NULL,
      kyc_attempt VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    -- Create index
    CREATE INDEX idx_tax_ids_sub_account_id ON tax_ids(sub_account_id);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Revert to original structure
  await queryInterface.sequelize.query(`
    -- Drop the table if it exists
    DROP TABLE IF EXISTS tax_ids CASCADE;

    -- Drop the enum type if it exists
    DROP TYPE IF EXISTS enum_tax_ids_account_type CASCADE;

    -- Create the original enum type
    CREATE TYPE enum_tax_ids_account_type AS ENUM('INDIVIDUAL', 'COMPANY');

    -- Create the table with the original structure
    CREATE TABLE tax_ids (
      tax_id VARCHAR(255) PRIMARY KEY,
      sub_account_id VARCHAR(255) NOT NULL,
      account_type enum_tax_ids_account_type NOT NULL,
      kyc_attempt VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    -- Create index
    CREATE INDEX idx_tax_ids_sub_account_id ON tax_ids(sub_account_id);
  `);
}
