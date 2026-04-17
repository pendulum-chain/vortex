import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Alter quote_tickets table
  await queryInterface.changeColumn("quote_tickets", "input_currency", {
    allowNull: false,
    type: DataTypes.STRING(30)
  });

  await queryInterface.changeColumn("quote_tickets", "output_currency", {
    allowNull: false,
    type: DataTypes.STRING(30)
  });

  // Alter partners table
  await queryInterface.changeColumn("partners", "markup_currency", {
    allowNull: true,
    type: DataTypes.STRING(30)
  });

  // Alter anchors table
  await queryInterface.changeColumn("anchors", "currency", {
    allowNull: false,
    defaultValue: "USD",
    type: DataTypes.STRING(30)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Revert quote_tickets table
  await queryInterface.changeColumn("quote_tickets", "input_currency", {
    allowNull: false,
    type: DataTypes.STRING(8)
  });

  await queryInterface.changeColumn("quote_tickets", "output_currency", {
    allowNull: false,
    type: DataTypes.STRING(8)
  });

  // Revert partners table
  await queryInterface.changeColumn("partners", "markup_currency", {
    allowNull: true,
    type: DataTypes.STRING(8)
  });

  // Revert anchors table
  await queryInterface.changeColumn("anchors", "currency", {
    allowNull: false,
    defaultValue: "USD",
    type: DataTypes.STRING(8)
  });
}
