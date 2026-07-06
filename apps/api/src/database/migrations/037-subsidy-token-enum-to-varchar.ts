import { QueryInterface } from "sequelize";

// The subsidy token symbol comes from the dynamic SquidRouter token registry
// (outTokenDetails.assetSymbol in final-settlement-subsidy) and per-network
// native symbols (BNB, AVAX), so the set of reachable values is open-ended —
// an enum can never be complete. Migration 036 already patched this failure
// mode once (ETH missing → createSubsidy failed silently). Widen to VARCHAR
// permanently so on-chain subsidies can't go unrecorded over bookkeeping.
const ENUM_VALUES_036 = ["GLMR", "PEN", "XLM", "USDC.axl", "BRLA", "EURC", "USDC", "MATIC", "BRL", "ETH", "USDT"];

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE VARCHAR(32);
  `);

  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_subsidies_token;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Map values the 036 enum can't hold to USDC before casting back.
  await queryInterface.sequelize.query(`
    UPDATE subsidies SET token = 'USDC' WHERE token NOT IN (${ENUM_VALUES_036.map(value => `'${value}'`).join(", ")});
  `);

  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_subsidies_token;
  `);

  await queryInterface.sequelize.query(`
    CREATE TYPE enum_subsidies_token AS ENUM (${ENUM_VALUES_036.map(value => `'${value}'`).join(", ")});
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE enum_subsidies_token USING token::enum_subsidies_token;
  `);
}
