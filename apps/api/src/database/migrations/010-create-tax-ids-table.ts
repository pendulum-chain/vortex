import { AveniaAccountType } from "@packages/shared/src/services";
import { DataTypes, QueryInterface } from "sequelize";

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("tax_ids");
}
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("tax_ids", {
    account_type: {
      allowNull: false,
      type: DataTypes.ENUM(...Object.values(AveniaAccountType))
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    kyc_attempt: {
      allowNull: true,
      type: DataTypes.STRING
    },
    sub_account_id: {
      allowNull: false,
      type: DataTypes.STRING
    },
    taxId: {
      primaryKey: true,
      type: DataTypes.STRING
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addIndex("tax_ids", ["sub_account_id"], {
    name: "idx_tax_ids_sub_account_id"
  });
}
