import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add route column to idempotency_keys table
  await queryInterface.addColumn('idempotency_keys', 'route', {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '/v1/ramp/register', // Default value for existing records
  });

  // Remove primary key constraint
  await queryInterface.removeConstraint('idempotency_keys', 'idempotency_keys_pkey');

  // Add composite primary key
  await queryInterface.addConstraint('idempotency_keys', {
    fields: ['key', 'route'],
    type: 'primary key',
    name: 'idempotency_keys_pkey',
  });

  // Add index for key and route
  await queryInterface.addIndex('idempotency_keys', ['key', 'route'], {
    name: 'idx_idempotency_key_route',
    unique: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove composite primary key
  await queryInterface.removeConstraint('idempotency_keys', 'idempotency_keys_pkey');

  // Remove index
  await queryInterface.removeIndex('idempotency_keys', 'idx_idempotency_key_route');

  // Add back single column primary key
  await queryInterface.addConstraint('idempotency_keys', {
    fields: ['key'],
    type: 'primary key',
    name: 'idempotency_keys_pkey',
  });

  // Remove route column
  await queryInterface.removeColumn('idempotency_keys', 'route');
}
