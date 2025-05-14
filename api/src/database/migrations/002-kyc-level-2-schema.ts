import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('kyc_level_2', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subaccountId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'subaccount_id',
    },
    documentType: {
      type: DataTypes.ENUM('RG', 'CNH'),
      allowNull: false,
      field: 'document_type',
    },
    status: {
      type: DataTypes.ENUM('Requested', 'DataCollected', 'BrlaValidating', 'Rejected', 'Accepted', 'Cancelled'),
      allowNull: false,
      defaultValue: 'Requested',
      field: 'status',
    },
    errorLogs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'error_logs',
    },
    uploadData: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'upload_data',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  });

  await queryInterface.addIndex('kyc_level_2', ['subaccount_id'], {
    name: 'idx_kyc_level_2_subaccount',
  });

  await queryInterface.addIndex('kyc_level_2', ['status'], {
    name: 'idx_kyc_level_2_status',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('kyc_level_2', 'idx_kyc_level_2_subaccount');
  await queryInterface.removeIndex('kyc_level_2', 'idx_kyc_level_2_status');
  await queryInterface.dropTable('kyc_level_2');
}
