import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the Partner model
export interface PartnerAttributes {
  id: string; // UUID
  name: string;
  displayName: string;
  logoUrl: string | null;
  markupType: 'absolute' | 'relative' | 'none';
  markupValue: number;
  markupCurrency: string | null;
  payoutAddress: string | null;
  feeType: 'on' | 'off';
  vortexFeeType: 'absolute' | 'relative' | 'none';
  vortexFeeValue: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type PartnerCreationAttributes = Optional<PartnerAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// Define the Partner model
class Partner extends Model<PartnerAttributes, PartnerCreationAttributes> implements PartnerAttributes {
  declare id: string;

  declare name: string;

  declare displayName: string;

  declare logoUrl: string | null;

  declare markupType: 'absolute' | 'relative' | 'none';

  declare markupValue: number;

  declare markupCurrency: string | null;

  declare payoutAddress: string | null;

  declare feeType: 'on' | 'off';

  declare vortexFeeType: 'absolute' | 'relative' | 'none';

  declare vortexFeeValue: number;

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
Partner.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'display_name',
    },
    logoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'logo_url',
    },
    markupType: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      defaultValue: 'none',
      field: 'markup_type',
    },
    markupValue: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      field: 'markup_value',
    },
    markupCurrency: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'markup_currency',
    },
    payoutAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payout_address',
    },
    feeType: {
      type: DataTypes.ENUM('on', 'off'),
      allowNull: false,
      field: 'fee_type',
    },
    vortexFeeType: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      defaultValue: 'none',
      field: 'vortex_fee_type',
    },
    vortexFeeValue: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      field: 'vortex_fee_value',
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
    modelName: 'Partner',
    tableName: 'partners',
    timestamps: true,
    indexes: [
      {
        name: 'idx_partners_name_fee_type',
        fields: ['name', 'fee_type'],
      },
    ],
  },
);

export default Partner;
