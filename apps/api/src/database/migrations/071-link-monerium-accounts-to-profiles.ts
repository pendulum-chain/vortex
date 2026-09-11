import { DataTypes, QueryInterface } from "sequelize";

// Bind each Monerium B2B account to the Vortex managed profile that owns it.
// Nullable because pre-mapping sandbox rows exist; application code requires it
// for every account provisioned through the admin mapping endpoint. The partial
// unique index enforces one account per profile without rejecting legacy NULLs.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "vortex_profile_id", {
    allowNull: true,
    references: { key: "id", model: "profiles" },
    type: DataTypes.UUID
  });
  await queryInterface.sequelize.query(
    "CREATE UNIQUE INDEX monerium_accounts_vortex_profile_id ON monerium_accounts (vortex_profile_id) WHERE vortex_profile_id IS NOT NULL"
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS monerium_accounts_vortex_profile_id");
  await queryInterface.removeColumn("monerium_accounts", "vortex_profile_id");
}
