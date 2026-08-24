import { QueryInterface } from "sequelize";

// Adds the 'vortex_admin' capability role. It grants access to the /v1/admin-console
// surface, which is the per-operator counterpart to the shared-secret /v1/admin routes.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('ALTER TABLE "profile_roles" DROP CONSTRAINT "chk_profile_roles_role";');
  await queryInterface.sequelize.query(
    `ALTER TABLE "profile_roles" ADD CONSTRAINT "chk_profile_roles_role" CHECK (role IN ('discount_manager', 'vortex_admin'));`
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`DELETE FROM "profile_roles" WHERE role = 'vortex_admin';`);
  await queryInterface.sequelize.query('ALTER TABLE "profile_roles" DROP CONSTRAINT "chk_profile_roles_role";');
  await queryInterface.sequelize.query(
    `ALTER TABLE "profile_roles" ADD CONSTRAINT "chk_profile_roles_role" CHECK (role IN ('discount_manager'));`
  );
}
