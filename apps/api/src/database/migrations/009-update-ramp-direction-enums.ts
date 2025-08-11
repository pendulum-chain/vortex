import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Phase 1: Remove default values and convert to VARCHAR
  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type DROP DEFAULT;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE ramp_states ALTER COLUMN type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE anchors ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  // Phase 2: Update all data with simple string replacement
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets SET ramp_type = 'BUY' WHERE ramp_type = 'on';
  `);
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets SET ramp_type = 'SELL' WHERE ramp_type = 'off';
  `);

  await queryInterface.sequelize.query(`
    UPDATE ramp_states SET type = 'BUY' WHERE type = 'on';
  `);
  await queryInterface.sequelize.query(`
    UPDATE ramp_states SET type = 'SELL' WHERE type = 'off';
  `);

  await queryInterface.sequelize.query(`
    UPDATE partners SET ramp_type = 'BUY' WHERE ramp_type = 'on';
  `);
  await queryInterface.sequelize.query(`
    UPDATE partners SET ramp_type = 'SELL' WHERE ramp_type = 'off';
  `);

  await queryInterface.sequelize.query(`
    UPDATE anchors SET ramp_type = 'BUY' WHERE ramp_type = 'on';
  `);
  await queryInterface.sequelize.query(`
    UPDATE anchors SET ramp_type = 'SELL' WHERE ramp_type = 'off';
  `);

  // Phase 3: Create new enum and convert back
  await queryInterface.sequelize.query(`
    CREATE TYPE ramp_direction_enum AS ENUM ('BUY', 'SELL');
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN ramp_type TYPE ramp_direction_enum USING ramp_type::ramp_direction_enum;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE ramp_states ALTER COLUMN type TYPE ramp_direction_enum USING type::ramp_direction_enum;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type TYPE ramp_direction_enum USING ramp_type::ramp_direction_enum;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE anchors ALTER COLUMN ramp_type TYPE ramp_direction_enum USING ramp_type::ramp_direction_enum;
  `);

  // Phase 4: Restore default value
  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type SET DEFAULT 'BUY';
  `);

  // Phase 5: Clean up old enum types
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_quote_tickets_ramp_type;
  `);
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_ramp_states_type;
  `);
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_partners_ramp_type;
  `);
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS enum_anchors_ramp_type;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Phase 1: Remove default and convert to VARCHAR
  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type DROP DEFAULT;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE ramp_states ALTER COLUMN type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE anchors ALTER COLUMN ramp_type TYPE VARCHAR(10);
  `);

  // Phase 2: Update data back to old values
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets SET ramp_type = 'on' WHERE ramp_type = 'BUY';
  `);
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets SET ramp_type = 'off' WHERE ramp_type = 'SELL';
  `);

  await queryInterface.sequelize.query(`
    UPDATE ramp_states SET type = 'on' WHERE type = 'BUY';
  `);
  await queryInterface.sequelize.query(`
    UPDATE ramp_states SET type = 'off' WHERE type = 'SELL';
  `);

  await queryInterface.sequelize.query(`
    UPDATE partners SET ramp_type = 'on' WHERE ramp_type = 'BUY';
  `);
  await queryInterface.sequelize.query(`
    UPDATE partners SET ramp_type = 'off' WHERE ramp_type = 'SELL';
  `);

  await queryInterface.sequelize.query(`
    UPDATE anchors SET ramp_type = 'on' WHERE ramp_type = 'BUY';
  `);
  await queryInterface.sequelize.query(`
    UPDATE anchors SET ramp_type = 'off' WHERE ramp_type = 'SELL';
  `);

  // Phase 3: Recreate old enum types
  await queryInterface.sequelize.query(`
    CREATE TYPE enum_quote_tickets_ramp_type AS ENUM ('on', 'off');
  `);
  await queryInterface.sequelize.query(`
    CREATE TYPE enum_ramp_states_type AS ENUM ('on', 'off');
  `);
  await queryInterface.sequelize.query(`
    CREATE TYPE enum_partners_ramp_type AS ENUM ('on', 'off');
  `);
  await queryInterface.sequelize.query(`
    CREATE TYPE enum_anchors_ramp_type AS ENUM ('on', 'off');
  `);

  // Phase 4: Convert back to old enums
  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN ramp_type TYPE enum_quote_tickets_ramp_type USING ramp_type::enum_quote_tickets_ramp_type;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE ramp_states ALTER COLUMN type TYPE enum_ramp_states_type USING type::enum_ramp_states_type;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type TYPE enum_partners_ramp_type USING ramp_type::enum_partners_ramp_type;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE anchors ALTER COLUMN ramp_type TYPE enum_anchors_ramp_type USING ramp_type::enum_anchors_ramp_type;
  `);

  // Phase 5: Restore old default value
  await queryInterface.sequelize.query(`
    ALTER TABLE partners ALTER COLUMN ramp_type SET DEFAULT 'on';
  `);

  // Phase 6: Clean up new enum type
  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS ramp_direction_enum;
  `);
}
