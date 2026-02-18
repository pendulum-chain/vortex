import { QueryInterface } from "sequelize";

const OLD_ENUM_VALUES = ["GLMR", "PEN", "XLM", "axlUSDC", "BRLA", "EURC"];
const NEW_ENUM_VALUES = ["GLMR", "PEN", "XLM", "USDC.axl", "BRLA", "EURC", "USDC", "MATIC", "BRL"];

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Phase 1: Convert enum to VARCHAR to allow value updates
  await queryInterface.sequelize.query(`
    ALTER TABLE subsidies ALTER COLUMN token TYPE VARCHAR(32);
  `);

  // Phase 2: Rename axlUSDC to USDC.axl
  await queryInterface.sequelize.query(`
    UPDATE subsidies SET token = 'USDC.axl' WHERE token = 'axlUSDC';
  `);

  // Phase 3: Replace enum type with updated values
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

  // Phase 2: Map unsupported values back to axlUSDC for the old enum
  await queryInterface.sequelize.query(`
    UPDATE subsidies SET token = 'axlUSDC' WHERE token = 'USDC.axl';
  `);

  await queryInterface.sequelize.query(`
    UPDATE subsidies SET token = 'axlUSDC' WHERE token IN ('USDC', 'MATIC', 'BRL');
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
