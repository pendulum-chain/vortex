import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("quote_tickets", "payment_method", {
    allowNull: false,
    type: DataTypes.STRING(20)
  });

  await queryInterface.addColumn("quote_tickets", "country_code", {
    allowNull: true,
    type: DataTypes.STRING(2)
  });

  await queryInterface.addColumn("quote_tickets", "network", {
    allowNull: false,
    type: DataTypes.STRING(20)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("quote_tickets", "payment_method");
  await queryInterface.removeColumn("quote_tickets", "country_code");
  await queryInterface.removeColumn("quote_tickets", "network");
}
