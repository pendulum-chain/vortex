import { DataTypes, QueryInterface } from "sequelize";

// Discounts a discount_manager attached to a recipient invite, materialized as partner
// pricing for the accepting profile on first acceptance. JSON array of
// { rampType, fiatCurrency, bps } so one invite can seed both directions.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("recipient_invitations", "seeded_discounts", {
    allowNull: true,
    type: DataTypes.JSONB
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("recipient_invitations", "seeded_discounts");
}
