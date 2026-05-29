import { DataTypes, QueryInterface } from "sequelize";

const TABLES = ["quote_tickets", "ramp_states"] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of TABLES) {
    await queryInterface.addColumn(table, "flow_variant", {
      allowNull: true,
      type: DataTypes.STRING(16)
    });

    await queryInterface.sequelize.query(`UPDATE "${table}" SET "flow_variant" = 'monerium' WHERE "flow_variant" IS NULL`);

    await queryInterface.changeColumn(table, "flow_variant", {
      allowNull: false,
      type: DataTypes.STRING(16)
    });

    await queryInterface.addIndex(table, ["flow_variant"], {
      name: `idx_${table}_flow_variant`
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of TABLES) {
    await queryInterface.removeIndex(table, `idx_${table}_flow_variant`);
    await queryInterface.removeColumn(table, "flow_variant");
  }
}
