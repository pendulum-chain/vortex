/**
 * Out-of-band operator tool: grants the vortex_admin capability role to a profile by
 * email. Not exposed over HTTP — vortex_admin can act as any customer, including moving
 * their money, so it must never be gated by the shared ADMIN_SECRET alone.
 *
 * Usage:
 *   bun run grant:vortex-admin <email>
 */
import sequelize from "../src/config/database";
import ProfileRole from "../src/models/profileRole.model";
import User from "../src/models/user.model";

const email = process.argv[2];
if (!email) {
  throw new Error("Usage: bun run grant:vortex-admin <email>");
}

try {
  await sequelize.authenticate();

  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error(`No profile found with email: ${email}`);
  }

  const [, created] = await ProfileRole.findOrCreate({
    defaults: { role: "vortex_admin", userId: user.id },
    where: { role: "vortex_admin", userId: user.id }
  });

  console.log(created ? `Granted vortex_admin to ${email} (${user.id}).` : `${email} (${user.id}) already has vortex_admin.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to grant vortex_admin");
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
