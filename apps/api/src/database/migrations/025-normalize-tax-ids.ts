import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Normalizes all tax_id values to digits-only (e.g. "758.444.017-77" → "75844401777").
  //
  // If both a formatted and unformatted entry exist for the same digits, a naive UPDATE would
  // hit a primary key collision. To handle this:
  //   1. Partition rows by their normalized digits and rank them — prefer the row with a
  //      non-empty sub_account_id, then most recent updated_at.
  //   2. Delete all lower-ranked duplicates.
  //   3. UPDATE the surviving rows to digits-only (now collision-free).
  await queryInterface.sequelize.query(`
    WITH normalized AS (
      SELECT
        ctid,
        "tax_id",
        regexp_replace("tax_id", '[^0-9]', '', 'g') AS digits,
        ROW_NUMBER() OVER (
          PARTITION BY regexp_replace("tax_id", '[^0-9]', '', 'g')
          ORDER BY
            CASE WHEN "sub_account_id" IS NOT NULL AND "sub_account_id" <> '' THEN 0 ELSE 1 END,
            "updated_at" DESC
        ) AS rn
      FROM "tax_ids"
    )
    DELETE FROM "tax_ids"
    WHERE ctid IN (SELECT ctid FROM normalized WHERE rn > 1);

    UPDATE "tax_ids"
    SET "tax_id" = regexp_replace("tax_id", '[^0-9]', '', 'g')
    WHERE "tax_id" ~ '[^0-9]';
  `);
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Irreversible: original formatting cannot be reconstructed from digits-only values.
}
