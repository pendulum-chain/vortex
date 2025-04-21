import { DataTypes, Model, Optional } from 'sequelize';
import { KYCDocType } from '../api/services/brla/types';
import sequelize from '../config/database';

export enum KycLevel2Status {
  REQUESTED = 'Requested',
  DATA_COLLECTED = 'DataCollected',
  BRLA_VALIDATING = 'BrlaValidating',
  REJECTED = 'Rejected',
  ACCEPTED = 'Accepted',
  CANCELLED = 'Cancelled',
}

export interface KycLevel2Attributes {
  id: string; 
  subaccountId: string;
  documentType: KYCDocType;
  status: KycLevel2Status;
  errorLogs: any[]; 
  onRamp: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type KycLevel2CreationAttributes = Optional<KycLevel2Attributes, 'id' | 'errorLogs' | 'createdAt' | 'updatedAt'>;

class KycLevel2 extends Model<KycLevel2Attributes, KycLevel2CreationAttributes> implements KycLevel2Attributes {
  declare id: string; // Doubles as token. TODO: is that safe?
  declare subaccountId: string;
  declare documentType: KYCDocType;
  declare status: KycLevel2Status;
  declare errorLogs: any[];
  declare onRamp: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

KycLevel2.init(
  {
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
      type: DataTypes.ENUM(...Object.values(KYCDocType)),
      allowNull: false,
      field: 'document_type',
    },
    status: {
      type: DataTypes.ENUM(...Object.values(KycLevel2Status)),
      allowNull: false,
      defaultValue: KycLevel2Status.REQUESTED,
      field: 'status',
    },
    errorLogs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'error_logs',
    },
    onRamp: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'on_ramp',
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
  },
  {
    sequelize,
    modelName: 'KycLevel2',
    tableName: 'kyc_level_2',
    timestamps: true,
    indexes: [
      {
        name: 'idx_kyc_level_2_subaccount',
        fields: ['subaccount_id'],
      },
      {
        name: 'idx_kyc_level_2_status',
        fields: ['status'],
      },
    ],
  },
);

export default KycLevel2;
