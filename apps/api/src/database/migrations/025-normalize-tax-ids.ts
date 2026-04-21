import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `UPDATE "tax_ids" SET "tax_id" = regexp_replace("tax_id", '[^0-9]', '', 'g') WHERE "tax_id" ~ '[^0-9]'`
  );
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Irreversible: original formatting cannot be reconstructed from digits-only values.
}
