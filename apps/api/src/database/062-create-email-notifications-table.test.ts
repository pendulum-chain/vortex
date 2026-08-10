import { beforeAll, describe, expect, it } from "bun:test";
import sequelize from "../config/database";
import EmailNotification, { NotificationStatus } from "../models/emailNotification.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestRampState, createTestUser } from "../test-utils/factories";
import { down, up } from "./migrations/062-create-email-notifications-table";

describe("062-create-email-notifications-table backfill", () => {
  beforeAll(async () => {
    await setupTestDatabase();
    await resetTestDatabase();
  });

  it("tombstones pre-existing completed ramps so the reconcile sweep cannot mail them", async () => {
    const user = await createTestUser();
    const completed = await createTestRampState({ currentPhase: "complete", userId: user.id });
    await createTestRampState({ currentPhase: "nablaSwap", userId: user.id });
    await createTestRampState({ currentPhase: "complete", userId: null });

    // Re-run the migration against a database that already holds those ramps —
    // the first-deploy scenario the backfill exists for.
    const queryInterface = sequelize.getQueryInterface();
    await down(queryInterface);
    await up(queryInterface);

    const rows = await EmailNotification.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].resourceId).toBe(completed.id);
    expect(rows[0].userId).toBe(user.id);
    expect(rows[0].status).toBe(NotificationStatus.Skipped);
    expect(rows[0].lastError).toContain("Backfilled");
  });
});
