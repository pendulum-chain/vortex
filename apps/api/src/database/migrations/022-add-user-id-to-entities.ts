import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add user_id to kyc_level_2
  await queryInterface.addColumn("kyc_level_2", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.changeColumn("kyc_level_2", "user_id", {
    allowNull: true,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "profiles"
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

  await queryInterface.changeColumn("quote_tickets", "user_id", {
    allowNull: true, // Merged from 023: Keep nullable
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "profiles"
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

  await queryInterface.changeColumn("ramp_states", "user_id", {
    allowNull: true,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "profiles"
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

  await queryInterface.changeColumn("tax_ids", "user_id", {
    allowNull: true,
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "profiles"
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

  // Remove indexes
  await safeRemoveIndex("kyc_level_2", "idx_kyc_level_2_user_id");
  await safeRemoveIndex("quote_tickets", "idx_quote_tickets_user_id");
  await safeRemoveIndex("ramp_states", "idx_ramp_states_user_id");
  await safeRemoveIndex("tax_ids", "idx_tax_ids_user_id");

  // Remove columns
  await safeRemoveColumn("ramp_states", "user_id");
  await safeRemoveColumn("tax_ids", "user_id");
  await safeRemoveColumn("kyc_level_2", "user_id");
  await safeRemoveColumn("quote_tickets", "user_id");
}
