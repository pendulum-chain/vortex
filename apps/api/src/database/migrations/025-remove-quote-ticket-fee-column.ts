import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("quote_tickets", "fee");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("quote_tickets", "fee", {
    allowNull: true,
    type: DataTypes.JSONB
  });

  await queryInterface.sequelize.query(`
    UPDATE quote_tickets
    SET fee = metadata->'fees'->'displayFiat'
    WHERE metadata->'fees'->'displayFiat' IS NOT NULL
  `);
}
