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

  await queryInterface.sequelize.query(`UPDATE kyc_level_2 SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`);

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

  // Add user_id to quote_tickets
  await queryInterface.addColumn("quote_tickets", "user_id", {
    allowNull: true,
    type: DataTypes.UUID
  });

  await queryInterface.sequelize.query(`UPDATE quote_tickets SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`);

  await queryInterface.changeColumn("quote_tickets", "user_id", {
    allowNull: false,
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

  await queryInterface.sequelize.query(`UPDATE ramp_states SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`);

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

  await queryInterface.sequelize.query(`UPDATE tax_ids SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`);

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
  await queryInterface.removeIndex("kyc_level_2", "idx_kyc_level_2_user_id");
  await queryInterface.removeIndex("quote_tickets", "idx_quote_tickets_user_id");
  await queryInterface.removeIndex("ramp_states", "idx_ramp_states_user_id");
  await queryInterface.removeIndex("tax_ids", "idx_tax_ids_user_id");

  await queryInterface.removeColumn("kyc_level_2", "user_id");
  await queryInterface.removeColumn("quote_tickets", "user_id");
  await queryInterface.removeColumn("ramp_states", "user_id");
  await queryInterface.removeColumn("tax_ids", "user_id");
}
