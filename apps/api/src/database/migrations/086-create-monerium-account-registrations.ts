import { DataTypes, QueryInterface } from "sequelize";

// Partner-registered destinations (docs/adr-0007-monerium-b2b-partner-registration.md):
// one row per Monerium profile, from the partner's request until the keeper has deployed
// the client's forwarder and mapped the account. Kept apart from monerium_accounts, whose
// rows are always verified, deployed clones the mint watcher scans.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("monerium_account_registrations", {
    account_id: {
      allowNull: true,
      onDelete: "SET NULL",
      references: { key: "id", model: "monerium_accounts" },
      type: DataTypes.UUID
    },
    contact_email: { allowNull: false, type: DataTypes.STRING(320) },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    deploy_sent_at: { allowNull: true, type: DataTypes.DATE },
    deploy_tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    destination: { allowNull: false, type: DataTypes.STRING(42) },
    external_subject_id: { allowNull: false, type: DataTypes.STRING(255) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    last_checked_at: { allowNull: true, type: DataTypes.DATE },
    manager_profile_id: {
      allowNull: false,
      onDelete: "RESTRICT",
      references: { key: "profile_id", model: "managed_profile_managers" },
      type: DataTypes.UUID
    },
    monerium_profile_id: { allowNull: false, type: DataTypes.STRING(64), unique: true },
    rejected_reason: { allowNull: true, type: DataTypes.STRING(500) },
    status: { allowNull: false, defaultValue: "requested", type: DataTypes.ENUM("requested", "mapped", "rejected") },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    waiting_reason: { allowNull: true, type: DataTypes.STRING(64) }
  });
  await queryInterface.addIndex("monerium_account_registrations", ["status"]);
  await queryInterface.addIndex("monerium_account_registrations", ["manager_profile_id"]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("monerium_account_registrations", {});
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monerium_account_registrations_status"');
}
