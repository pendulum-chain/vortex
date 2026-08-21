/**
 * Restores the sales-demo account to its pitch-ready state.
 *
 *   bun run seed:demo
 *
 * Sandbox only — the restore routine itself refuses to run anywhere else. The demo profile
 * must have signed in once via OTP first; the seed cannot forge a Supabase Auth user.
 * See docs/operations-demo-environment.md.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dir, "../.env") });

const unknownArguments = process.argv.slice(2);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

async function main(): Promise<void> {
  const [{ default: sequelize }, { restoreDemoAccount }] = await Promise.all([
    import("../src/config/database"),
    import("../src/api/services/demo/demo-account.service")
  ]);

  try {
    const summary = await restoreDemoAccount();
    console.log(`Restored demo account ${summary.profileId} (entity ${summary.senderEntityId}).`);
    console.log(`  recipients: ${summary.recipients}`);
    console.log(`  transactions: ${summary.transactions}`);
    console.log(`  reset-corridor provider rows removed: ${summary.resetCorridorRowsRemoved}`);
  } finally {
    await sequelize.close();
  }
}

main().catch(error => {
  console.error("Failed to restore the demo account:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
