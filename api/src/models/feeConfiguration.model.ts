import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the FeeConfiguration model
export interface FeeConfigurationAttributes {
  id: string; // UUID
  feeType: 'anchor_base' | 'network_estimate';
  identifier: string | null;
  valueType: 'absolute' | 'relative';
  value: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type FeeConfigurationCreationAttributes = Optional<FeeConfigurationAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// Define the FeeConfiguration model
class FeeConfiguration extends Model<FeeConfigurationAttributes, FeeConfigurationCreationAttributes> implements FeeConfigurationAttributes {
  declare id: string;

  declare feeType: 'anchor_base' | 'network_estimate';

  declare identifier: string | null;

  declare valueType: 'absolute' | 'relative';

  declare value: number;

  declare currency: string;

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
FeeConfiguration.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    feeType: {
      type: DataTypes.ENUM('vortex_foundation', 'anchor_base', 'network_estimate'),
      allowNull: false,
      field: 'fee_type',
    },
    identifier: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"',
    },
    valueType: {
      type: DataTypes.ENUM('absolute', 'relative'),
      allowNull: false,
      field: 'value_type',
    },
    value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'USD',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'FeeConfiguration',
    tableName: 'fee_configurations',
    timestamps: true,
    indexes: [
      {
        name: 'idx_fee_configurations_lookup',
        fields: ['fee_type', 'identifier', 'is_active'],
      },
    ],
  },
);

export default FeeConfiguration;
