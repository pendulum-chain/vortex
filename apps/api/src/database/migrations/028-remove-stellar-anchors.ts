import { Op, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkDelete("anchors", {
    identifier: {
      [Op.in]: ["stellar_eurc", "stellar_ars"]
    }
  });

  await queryInterface.sequelize.query("DELETE FROM subsidies WHERE token = 'XLM'");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert("anchors", [
    {
      created_at: new Date(),
      currency: "EUR",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_eurc",
      is_active: true,
      ramp_type: "off",
      updated_at: new Date(),
      value: 0.0025,
      value_type: "relative"
    },
    {
      created_at: new Date(),
      currency: "ARS",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_ars",
      is_active: true,
      ramp_type: "off",
      updated_at: new Date(),
      value: 0.02,
      value_type: "relative"
    },
    {
      created_at: new Date(),
      currency: "ARS",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_ars",
      is_active: true,
      ramp_type: "off",
      updated_at: new Date(),
      value: 10,
      value_type: "absolute"
    }
  ]);
}
