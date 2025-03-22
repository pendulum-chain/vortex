import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the PhaseMetadata model
interface PhaseMetadataAttributes {
  id: string; // UUID
  phaseName: string;
  requiredTransactions: string[]; // JSONB array
  successConditions: any; // JSONB
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  }; // JSONB
  validTransitions: string[]; // JSONB array
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
interface PhaseMetadataCreationAttributes extends Optional<PhaseMetadataAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

// Define the PhaseMetadata model
class PhaseMetadata
  extends Model<PhaseMetadataAttributes, PhaseMetadataCreationAttributes>
  implements PhaseMetadataAttributes
{
  public id!: string;
  public phaseName!: string;
  public requiredTransactions!: string[];
  public successConditions!: any;
  public retryPolicy!: {
    maxAttempts: number;
    backoffMs: number;
  };
  public validTransitions!: string[];
  public createdAt!: Date;
  public updatedAt!: Date;
}

// Initialize the model
PhaseMetadata.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phaseName: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'phase_name',
    },
    requiredTransactions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'required_transactions',
    },
    successConditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'success_conditions',
    },
    retryPolicy: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        maxAttempts: 3,
        backoffMs: 1000,
      },
      field: 'retry_policy',
    },
    validTransitions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'valid_transitions',
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
    modelName: 'PhaseMetadata',
    tableName: 'phase_metadata',
    timestamps: true,
    indexes: [
      {
        name: 'idx_phase_metadata_name',
        fields: ['phase_name'],
      },
    ],
  },
);

export default PhaseMetadata;
