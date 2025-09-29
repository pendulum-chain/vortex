import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // This migration alters the table to align with new requirements without dropping it.
  await queryInterface.sequelize.query(`
    -- Rename the "taxId" column to "tax_id" to match naming conventions
    ALTER TABLE "tax_ids" RENAME COLUMN "taxId" TO "tax_id";

    -- Add the 'COMPANY' value to the existing enum type.
    -- This is a non-destructive operation.
    ALTER TYPE "enum_tax_ids_account_type" ADD VALUE 'COMPANY';
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Reverting this migration requires removing an enum value, which is a multi-step process.
  await queryInterface.sequelize.query(`
    -- Before changing the enum, we must handle any data that uses the 'COMPANY' value.
    -- We will update these rows to 'INDIVIDUAL'. This is a data-altering operation
    -- necessary for a clean rollback.
    UPDATE "tax_ids" SET "account_type" = 'INDIVIDUAL' WHERE "account_type"::text = 'COMPANY';

    -- Rename the current enum so we can recreate the old one
    ALTER TYPE "enum_tax_ids_account_type" RENAME TO "enum_tax_ids_account_type_new";

    -- Create the old enum type with only 'INDIVIDUAL'
    CREATE TYPE "enum_tax_ids_account_type" AS ENUM('INDIVIDUAL');

    -- Update the table to use the old enum type.
    -- The USING clause casts the old enum values to text and then to the new enum type.
    ALTER TABLE "tax_ids"
    ALTER COLUMN "account_type" TYPE "enum_tax_ids_account_type"
    USING ("account_type"::text::"enum_tax_ids_account_type");

    -- Drop the new enum type that we renamed
    DROP TYPE "enum_tax_ids_account_type_new";

    -- Rename the "tax_id" column back to "taxId"
    ALTER TABLE "tax_ids" RENAME COLUMN "tax_id" TO "taxId";
  `);
}
