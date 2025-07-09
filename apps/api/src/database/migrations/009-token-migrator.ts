import { QueryInterface } from "sequelize";

// This migration adds new tokens to the ENUM type used for subsidies. Needed after SubsidyToken enum was extended.
const ENUM_NAME = "enum_subsidies_token";

const NEW_TOKENS: any = [];

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (NEW_TOKENS.length === 0) {
    return;
  }
  for (const token of NEW_TOKENS) {
    await queryInterface.sequelize.query(`ALTER TYPE "${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${token}'`);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  console.log(`Reverting the addition of values from ENUM "${ENUM_NAME}" is not supported automatically.`);
  return Promise.resolve();
}
