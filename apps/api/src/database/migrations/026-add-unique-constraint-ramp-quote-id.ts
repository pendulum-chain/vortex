import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("ramp_states", "idx_ramp_quote");

  await queryInterface.addConstraint("ramp_states", {
    fields: ["quote_id"],
    name: "uq_ramp_states_quote_id",
    type: "unique"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeConstraint("ramp_states", "uq_ramp_states_quote_id");

  await queryInterface.addIndex("ramp_states", ["quote_id"], {
    name: "idx_ramp_quote"
  });
}
