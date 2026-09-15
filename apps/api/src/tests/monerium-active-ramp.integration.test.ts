import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { findActiveMoneriumRampForOwner } from "../api/services/monerium/active-ramp";
import sequelize from "../config/database";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestRampState } from "../test-utils/factories";

const OWNER = "0xAbC0000000000000000000000000000000000001";

function moneriumState(owner = OWNER) {
  return { blockState: { moneriumIssue: { owner } } } as never;
}

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

describe("findActiveMoneriumRampForOwner", () => {
  it("finds a started ramp for the owner regardless of address case", async () => {
    const ramp = await createTestRampState({ currentPhase: "moneriumOnrampMint", state: moneriumState() });

    await expect(findActiveMoneriumRampForOwner(OWNER.toLowerCase())).resolves.toBe(ramp.id);
  });

  it("finds an unstarted ramp only while it can still be started", async () => {
    const fresh = await createTestRampState({ currentPhase: "initial", state: moneriumState() });
    await expect(findActiveMoneriumRampForOwner(OWNER)).resolves.toBe(fresh.id);

    await sequelize.query("UPDATE ramp_states SET created_at = now() - interval '16 minutes' WHERE id = :id", {
      replacements: { id: fresh.id }
    });
    await expect(findActiveMoneriumRampForOwner(OWNER)).resolves.toBeNull();
  });

  it("ignores terminal ramps and other owners", async () => {
    await createTestRampState({ currentPhase: "complete", state: moneriumState() });
    await createTestRampState({ currentPhase: "failed", state: moneriumState() });
    await createTestRampState({ currentPhase: "moneriumOnrampMint", state: moneriumState("0x2222222222222222222222222222222222222222") });

    await expect(findActiveMoneriumRampForOwner(OWNER)).resolves.toBeNull();
  });
});
