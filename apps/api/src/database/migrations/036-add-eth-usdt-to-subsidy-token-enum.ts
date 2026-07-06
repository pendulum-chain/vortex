import { QueryInterface } from "sequelize";

// Migration 022 left the DB enum without ETH even though SubsidyToken.ETH existed
// in the model (squid-router-pay ETH gas subsidies failed silently in createSubsidy).
// USDT is new: finalSettlementSubsidy now records rows for USDT settlement top-ups.
const OLD_ENUM_VALUES = ["GLMR", "PEN", "XLM", "USDC.axl", "BRLA", "EURC", "USDC", "MATIC", "BRL"];
const NEW_ENUM_VALUES = [...OLD_ENUM_VALUES, "ETH", "USDT"];

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Phase 1: Convert enum to VARCHAR to allow value updates
  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE VARCHAR(32);
  `);

  // Phase 2: Replace enum type with updated values
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_subsidies_token;
  `);

  await queryInterface.sequelize.query(`
    CREATE TYPE enum_subsidies_token AS ENUM (${NEW_ENUM_VALUES.map(value => `'${value}'`).join(", ")});
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE enum_subsidies_token USING token::enum_subsidies_token;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Phase 1: Convert enum to VARCHAR to allow value updates
  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE VARCHAR(32);
  `);

  // Phase 2: Map values unsupported by the old enum to USDC
  await queryInterface.sequelize.query(`
    UPDATE subsidies SET token = 'USDC' WHERE token IN ('ETH', 'USDT');
  `);

  // Phase 3: Restore old enum type
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_subsidies_token;
  `);

  await queryInterface.sequelize.query(`
    CREATE TYPE enum_subsidies_token AS ENUM (${OLD_ENUM_VALUES.map(value => `'${value}'`).join(", ")});
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE enum_subsidies_token USING token::enum_subsidies_token;
  `);
}
