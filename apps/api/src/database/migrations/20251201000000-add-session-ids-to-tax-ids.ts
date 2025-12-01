import { DataTypes, QueryInterface } from "sequelize";

export default {
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("tax_ids", "initial_session_id");
    await queryInterface.removeColumn("tax_ids", "final_session_id");
  },
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("tax_ids", "initial_session_id", {
      allowNull: true,
      type: DataTypes.STRING
    });
    await queryInterface.addColumn("tax_ids", "final_session_id", {
      allowNull: true,
      type: DataTypes.STRING
    });
  }
};
