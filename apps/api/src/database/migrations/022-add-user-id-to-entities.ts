import { DataTypes, QueryInterface } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Generate a dummy user ID for migration
  const DUMMY_USER_ID = uuidv4();

  console.log(`Using dummy user ID for migration: ${DUMMY_USER_ID}`);

  // Add user_id to kyc_level_2
  await queryInterface.addColumn("kyc_level_2", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  // Insert dummy user to satisfy foreign key constraint
  const timestamp = new Date().toISOString();
  await queryInterface.sequelize.query(`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES ('${DUMMY_USER_ID}', 'migration_placeholder_${DUMMY_USER_ID}@example.com', '${timestamp}', '${timestamp}')
    ON CONFLICT (id) DO NOTHING;
  `);

  await queryInterface.sequelize.query(`
    UPDATE kyc_level_2 
    SET user_id = '${DUMMY_USER_ID}' 
    WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)
  `);

  await queryInterface.changeColumn("kyc_level_2", "user_id", {
    allowNull: false,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "users"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("kyc_level_2", ["user_id"], {
    name: "idx_kyc_level_2_user_id"
  });

  // Add user_id to quote_tickets (Merged from 023: nullable, no dummy user)
  await queryInterface.addColumn("quote_tickets", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  // NOTE: skip update content for quote_tickets as we want it to be nullable for existing rows

  await queryInterface.changeColumn("quote_tickets", "user_id", {
    allowNull: true, // Merged from 023: Keep nullable
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "users"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("quote_tickets", ["user_id"], {
    name: "idx_quote_tickets_user_id"
  });

  // Add user_id to ramp_states
  await queryInterface.addColumn("ramp_states", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.sequelize.query(`
    UPDATE ramp_states 
    SET user_id = '${DUMMY_USER_ID}' 
    WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)
  `);

  await queryInterface.changeColumn("ramp_states", "user_id", {
    allowNull: false,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "users"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("ramp_states", ["user_id"], {
    name: "idx_ramp_states_user_id"
  });

  // Add user_id to tax_ids
  await queryInterface.addColumn("tax_ids", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.sequelize.query(`
    UPDATE tax_ids 
    SET user_id = '${DUMMY_USER_ID}' 
    WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users)
  `);

  await queryInterface.changeColumn("tax_ids", "user_id", {
    allowNull: false,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "users"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("tax_ids", ["user_id"], {
    name: "idx_tax_ids_user_id"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const safeRemoveIndex = async (tableName: string, indexName: string) => {
    try {
      await queryInterface.removeIndex(tableName, indexName);
    } catch (error: any) {
      console.warn(`Failed to remove index ${indexName} from ${tableName}:`, error);
    }
  };

  const safeRemoveColumn = async (tableName: string, columnName: string) => {
    try {
      await queryInterface.removeColumn(tableName, columnName);
    } catch (error: any) {
      // Ignore undefined_column error (code 42703)
      if (error?.original?.code === "42703") {
        console.warn(`Column ${columnName} does not exist in ${tableName}, skipping removal.`);
      } else {
        throw error;
      }
    }
  };

  // IMPORTANT: Set user_id to NULL for records referencing dummy users BEFORE removing columns
  // This prevents CASCADE deletion of data when the dummy user is deleted
  await queryInterface.sequelize.query(`
    UPDATE kyc_level_2
    SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'migration_placeholder_%')
  `);

  await queryInterface.sequelize.query(`
    UPDATE ramp_states
    SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'migration_placeholder_%')
  `);

  await queryInterface.sequelize.query(`
    UPDATE tax_ids
    SET user_id = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'migration_placeholder_%')
  `);

  // Remove the dummy user created in up() (now safe to delete without cascading)
  await queryInterface.sequelize.query(`DELETE FROM users WHERE email LIKE 'migration_placeholder_%'`);

  // Remove indexes
  await safeRemoveIndex("kyc_level_2", "idx_kyc_level_2_user_id");
  await safeRemoveIndex("quote_tickets", "idx_quote_tickets_user_id");
  await safeRemoveIndex("ramp_states", "idx_ramp_states_user_id");
  await safeRemoveIndex("tax_ids", "idx_tax_ids_user_id");

  // Remove columns
  await safeRemoveColumn("ramp_states", "user_id");
  await safeRemoveColumn("tax_ids", "user_id");
  await safeRemoveColumn("kyc_level_2", "user_id");

  // NOTE: quote_tickets.user_id is nullable, so we can just remove it
  await safeRemoveColumn("quote_tickets", "user_id");
}
