import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("kyc_level_2", {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    documentType: {
      allowNull: false,
      field: "document_type",
      type: DataTypes.ENUM("RG", "CNH")
    },
    errorLogs: {
      allowNull: false,
      defaultValue: [],
      field: "error_logs",
      type: DataTypes.JSONB
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "Requested",
      field: "status",
      type: DataTypes.ENUM("Requested", "DataCollected", "BrlaValidating", "Rejected", "Accepted", "Cancelled")
    },
    subaccountId: {
      allowNull: false,
      field: "subaccount_id",
      type: DataTypes.STRING
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    uploadData: {
      allowNull: false,
      field: "upload_data",
      type: DataTypes.JSONB
    }
  });

  await queryInterface.addIndex("kyc_level_2", ["subaccount_id"], {
    name: "idx_kyc_level_2_subaccount"
  });

  await queryInterface.addIndex("kyc_level_2", ["status"], {
    name: "idx_kyc_level_2_status"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("kyc_level_2", "idx_kyc_level_2_subaccount");
  await queryInterface.removeIndex("kyc_level_2", "idx_kyc_level_2_status");
  await queryInterface.dropTable("kyc_level_2");
}
