import { DataTypes, Op, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("profile_wallets", {
    address: {
      allowNull: false,
      type: DataTypes.STRING(42)
    },
    chain_type: {
      allowNull: false,
      defaultValue: "ethereum",
      type: DataTypes.STRING(32)
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    last_used_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    profile_id: {
      allowNull: false,
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    provider: {
      allowNull: false,
      defaultValue: "cdp",
      type: DataTypes.STRING(32)
    },
    provider_wallet_id: {
      allowNull: false,
      type: DataTypes.STRING(255)
    },
    status: {
      allowNull: false,
      defaultValue: "active",
      type: DataTypes.STRING(32)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("profile_wallets", {
    fields: ["provider"],
    name: "profile_wallets_provider_check",
    type: "check",
    where: { provider: { [Op.in]: ["cdp"] } }
  });
  await queryInterface.addConstraint("profile_wallets", {
    fields: ["chain_type"],
    name: "profile_wallets_chain_type_check",
    type: "check",
    where: { chain_type: { [Op.in]: ["ethereum"] } }
  });
  await queryInterface.addConstraint("profile_wallets", {
    fields: ["status"],
    name: "profile_wallets_status_check",
    type: "check",
    where: { status: { [Op.in]: ["active", "archived"] } }
  });
  await queryInterface.addConstraint("profile_wallets", {
    fields: ["provider", "provider_wallet_id"],
    name: "uniq_profile_wallets_provider_wallet",
    type: "unique"
  });
  await queryInterface.addIndex("profile_wallets", ["profile_id", "provider", "chain_type"], {
    name: "idx_profile_wallets_profile_provider_chain"
  });
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uniq_profile_wallets_active_provider_chain
    ON profile_wallets (profile_id, provider, chain_type)
    WHERE status = 'active';
  `);
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uniq_profile_wallets_evm_address
    ON profile_wallets (chain_type, LOWER(address));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS uniq_profile_wallets_evm_address;");
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS uniq_profile_wallets_active_provider_chain;");
  await queryInterface.dropTable("profile_wallets");
}
