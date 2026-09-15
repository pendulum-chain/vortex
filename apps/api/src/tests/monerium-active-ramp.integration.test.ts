import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { findActiveMoneriumRampForOwner, lockMoneriumOwner, lockMoneriumProfile } from "../api/services/monerium/active-ramp";
import type { MoneriumIdentity } from "../api/services/monerium/identity";
import { moveMoneriumIban } from "../api/services/monerium/wallet";
import sequelize from "../config/database";
import RampState from "../models/rampState.model";
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

describe("Monerium owner registration lock", () => {
  it("makes a concurrent registration for another profile see the first ramp after it commits", async () => {
    const ramp = await createTestRampState({ state: moneriumState("0x2222222222222222222222222222222222222222") });
    let firstWritten!: () => void;
    let releaseFirst!: () => void;
    const written = new Promise<void>(resolve => (firstWritten = resolve));
    const release = new Promise<void>(resolve => (releaseFirst = resolve));

    const first = sequelize.transaction(async transaction => {
      await lockMoneriumProfile("profile-1", transaction);
      await lockMoneriumOwner(OWNER, transaction);
      expect(await findActiveMoneriumRampForOwner(OWNER, transaction)).toBeNull();
      await RampState.update({ state: moneriumState() }, { transaction, where: { id: ramp.id } });
      firstWritten();
      await release;
    });
    await written;

    const second = sequelize.transaction(async transaction => {
      await lockMoneriumProfile("profile-2", transaction);
      await lockMoneriumOwner(OWNER.toLowerCase(), transaction);
      return findActiveMoneriumRampForOwner(OWNER, transaction);
    });
    // Give the second transaction time to reach the lock while the first insert is uncommitted.
    await new Promise(resolve => setTimeout(resolve, 50));
    releaseFirst();

    await first;
    expect(await second).toBe(ramp.id);
  });

  it("keeps a concurrent IBAN move from redirecting a just-registered pay-in", async () => {
    const ramp = await createTestRampState({ state: moneriumState("0x3333333333333333333333333333333333333333") });
    let firstWritten!: () => void;
    let releaseFirst!: () => void;
    const written = new Promise<void>(resolve => (firstWritten = resolve));
    const release = new Promise<void>(resolve => (releaseFirst = resolve));
    const first = sequelize.transaction(async transaction => {
      await lockMoneriumProfile("profile-1", transaction);
      await lockMoneriumOwner(OWNER, transaction);
      await RampState.update({ state: moneriumState() }, { transaction, where: { id: ramp.id } });
      firstWritten();
      await release;
    });
    await written;

    const updateIbanDestination = mock(async () => undefined);
    const identity = {
      client: {
        listAddresses: async () => ({ addresses: [{ address: "0x2222222222222222222222222222222222222222", chains: ["polygon"], profile: "profile-1" }] }),
        listIbans: async () => ({ ibans: [{ address: OWNER, chain: "polygon", iban: "DE89370400440532013000", profile: "profile-1" }] }),
        updateIbanDestination
      },
      profileId: "profile-1",
      source: "whitelabel"
    } as unknown as MoneriumIdentity;
    const move = moveMoneriumIban(
      "user-1",
      { address: "0x2222222222222222222222222222222222222222", chain: "polygon" },
      {
        isContractAddress: async () => false,
        resolveIdentity: async () => identity,
        verifyOwnership: async () => true
      }
    ).catch(error => error);
    await new Promise(resolve => setTimeout(resolve, 50));
    releaseFirst();

    await first;
    expect(await move).toMatchObject({ status: 409, message: expect.stringContaining(ramp.id) });
    expect(updateIbanDestination).not.toHaveBeenCalled();
  });
});
