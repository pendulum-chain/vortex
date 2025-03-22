import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the IdempotencyKey model
interface IdempotencyKeyAttributes {
  key: string;
  rampId: string | null; // UUID reference to RampState
  responseStatus: number;
  responseBody: any; // JSONB
  createdAt: Date;
  expiredAt: Date;
}

// Define the attributes that can be set during creation
interface IdempotencyKeyCreationAttributes extends Optional<IdempotencyKeyAttributes, 'createdAt'> {}

// Define the IdempotencyKey model
class IdempotencyKey
  extends Model<IdempotencyKeyAttributes, IdempotencyKeyCreationAttributes>
  implements IdempotencyKeyAttributes
{
  public key!: string;
  public rampId!: string | null;
  public responseStatus!: number;
  public responseBody!: any;
  public createdAt!: Date;
  public expiredAt!: Date;
}

// Initialize the model
IdempotencyKey.init(
  {
    key: {
      type: DataTypes.STRING(36),
      primaryKey: true,
    },
    rampId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ramp_id',
      references: {
        model: 'ramp_states',
        key: 'id',
      },
    },
    responseStatus: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'response_status',
    },
    responseBody: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'response_body',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    expiredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      field: 'expired_at',
    },
  },
  {
    sequelize,
    modelName: 'IdempotencyKey',
    tableName: 'idempotency_keys',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        name: 'idx_idempotency_expiry',
        fields: ['expiredAt'],
      },
    ],
  },
);

export default IdempotencyKey;
