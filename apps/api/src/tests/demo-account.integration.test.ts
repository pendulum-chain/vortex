import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Op } from "sequelize";
import { restoreDemoAccount, restoreDemoAccountOnLogin } from "../api/services/demo/demo-account.service";
import { assertPersistedBlockFlowVersionsSupported } from "../api/services/phases/blocks/register-handlers";
import { hashInviteToken } from "../api/services/recipients/recipient-invite.service";
import { config } from "../config/vars";
import CustomerEntity from "../models/customerEntity.model";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import RampState from "../models/rampState.model";
import RecipientInvitation from "../models/recipientInvitation.model";
import SenderRecipient from "../models/senderRecipient.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";

const DEMO_EMAIL = "demo-account@example.com";
let originalDeploymentEnv: typeof config.deploymentEnv;
let originalDemoEmail: string;

beforeAll(async () => {
  await setupTestDatabase();
  originalDeploymentEnv = config.deploymentEnv;
  originalDemoEmail = config.demoAccountEmail;
  config.deploymentEnv = "sandbox";
  config.demoAccountEmail = DEMO_EMAIL;
});

afterAll(() => {
  config.deploymentEnv = originalDeploymentEnv;
  config.demoAccountEmail = originalDemoEmail;
});

beforeEach(async () => {
  await resetTestDatabase();
});

async function createDemoProfile(): Promise<User> {
  return createTestUser({ email: DEMO_EMAIL });
}

describe("demo account restore", () => {
  it("refuses to run outside sandbox", async () => {
    config.deploymentEnv = "production";
    try {
      await expect(restoreDemoAccount()).rejects.toThrow(/sandbox-only/);
    } finally {
      config.deploymentEnv = "sandbox";
    }
  });

  it("explains that the profile has to sign in once first", async () => {
    await expect(restoreDemoAccount()).rejects.toThrow(/must sign in once/);
  });

  it("seeds a business sender, recipients, and both completed and in-flight transactions", async () => {
    const profile = await createDemoProfile();

    const summary = await restoreDemoAccount();

    const entity = await CustomerEntity.findByPk(summary.senderEntityId);
    expect(entity?.type).toBe("business");
    expect((await User.findByPk(profile.id))?.activeCustomerEntityId).toBe(summary.senderEntityId);

    expect(await RecipientInvitation.count({ where: { senderCustomerEntityId: summary.senderEntityId } })).toBe(4);
    expect(await SenderRecipient.count({ where: { senderCustomerEntityId: summary.senderEntityId } })).toBe(3);

    const ramps = await RampState.findAll({ where: { userId: profile.id } });
    expect(ramps.filter(ramp => ramp.currentPhase === "complete")).toHaveLength(2);
    expect(ramps.filter(ramp => ramp.currentPhase !== "complete")).toHaveLength(2);
  });

  // The dashboard surfaces invitation.token for sender re-copy, and redemption resolves the
  // link via hashInviteToken(token) — a hash derived from any other string turns the copied
  // invite link into "invalid invitation" mid-demo.
  it("stores a pending invite token the accept lookup can resolve", async () => {
    await createDemoProfile();

    const { senderEntityId } = await restoreDemoAccount();

    const pending = await RecipientInvitation.findOne({
      where: { senderCustomerEntityId: senderEntityId, status: "pending" }
    });
    expect(pending?.token).toBeTruthy();
    const resolved = await RecipientInvitation.findOne({ where: { tokenHash: hashInviteToken(pending?.token as string) } });
    expect(resolved?.id).toBe(pending?.id as string);
  });

  // RampRecoveryWorker drives any stale non-terminal ramp through the phase processor, which fails
  // it when there is no chain state behind it. Its query skips ramps without presigned transactions,
  // so seeded in-flight rows must have none — otherwise the demo history rots into failures.
  it("leaves in-flight transactions invisible to the recovery worker", async () => {
    const profile = await createDemoProfile();
    await restoreDemoAccount();

    const inFlight = await RampState.findAll({
      where: { currentPhase: { [Op.notIn]: ["complete", "failed", "initial"] }, userId: profile.id }
    });

    expect(inFlight).toHaveLength(2);
    for (const ramp of inFlight) {
      expect(ramp.presignedTxs).toBeNull();
    }
  });

  it("is repeatable without duplicating anything", async () => {
    const profile = await createDemoProfile();

    const first = await restoreDemoAccount();
    await restoreDemoAccount();
    const third = await restoreDemoAccount();

    expect(third.senderEntityId).toBe(first.senderEntityId);
    expect(await RecipientInvitation.count({ where: { senderCustomerEntityId: first.senderEntityId } })).toBe(4);
    expect(await SenderRecipient.count({ where: { senderCustomerEntityId: first.senderEntityId } })).toBe(3);
    expect(await RampState.count({ where: { userId: profile.id } })).toBe(4);
  });

  it("clears the reset corridor but keeps the real one and any real ramp", async () => {
    const profile = await createDemoProfile();
    const { senderEntityId } = await restoreDemoAccount();

    // Stand in for a corridor Florian onboarded live during a demo.
    const coCustomer = await ProviderCustomer.create({
      country: "CO",
      customerEntityId: senderEntityId,
      customerType: "business",
      provider: "alfredpay",
      rail: "cop",
      status: VerificationStatus.Approved
    });
    await KycCase.create({
      customerEntityId: senderEntityId,
      provider: "alfredpay",
      providerCustomerId: coCustomer.id,
      status: VerificationStatus.Approved
    });
    const realCorridor = await ProviderCustomer.create({
      country: "BR",
      customerEntityId: senderEntityId,
      customerType: "business",
      provider: "avenia",
      rail: "brl",
      status: VerificationStatus.Approved
    });

    const summary = await restoreDemoAccount();

    expect(summary.resetCorridorRowsRemoved).toBe(1);
    expect(await ProviderCustomer.findByPk(coCustomer.id)).toBeNull();
    expect(await KycCase.count({ where: { providerCustomerId: coCustomer.id } })).toBe(0);
    expect(await ProviderCustomer.findByPk(realCorridor.id)).not.toBeNull();
    expect(await RampState.count({ where: { userId: profile.id } })).toBe(4);
  });

  it("backdates the history so the seeded ages survive the upsert", async () => {
    const profile = await createDemoProfile();
    const restoredAt = Date.now();

    await restoreDemoAccount();

    const ramps = await RampState.findAll({ order: [["createdAt", "ASC"]], where: { userId: profile.id } });
    const agesInMinutes = ramps.map(ramp => Math.round((restoredAt - ramp.createdAt.getTime()) / 60_000));
    // Sequelize's upsert stamps its own timestamps; without the explicit backdate every row
    // lands at "now" and the history reads as fabricated.
    expect(agesInMinutes).toEqual([60 * 26, 60 * 8, 95, 20]);
    expect(new Set(agesInMinutes).size).toBe(4);
  });

  it("leaves the API bootable: seeded rows satisfy the persisted block-flow assertion", async () => {
    await createDemoProfile();

    await restoreDemoAccount();

    // The seeded in-flight ramps are resumable, so the startup guard walks them. Quotes without
    // real block-flow metadata make this throw and the API never finishes booting.
    await assertPersistedBlockFlowVersionsSupported();
  });

  it("refuses a profile that already committed to an individual entity", async () => {
    const profile = await createDemoProfile();
    const individual = await CustomerEntity.create({ profileId: profile.id, type: "individual" });
    await profile.update({ activeCustomerEntityId: individual.id });

    await expect(restoreDemoAccount()).rejects.toThrow(/immutable/);
  });
});

describe("demo account restore on login", () => {
  it("ignores every other account", async () => {
    const other = await createTestUser({ email: "someone-else@example.com" });

    await restoreDemoAccountOnLogin("someone-else@example.com");

    expect(await RampState.count({ where: { userId: other.id } })).toBe(0);
  });

  it("does not let a restore failure break the login", async () => {
    // No demo profile exists yet, so the restore throws; the login path must swallow it.
    await restoreDemoAccountOnLogin(DEMO_EMAIL.toUpperCase());
  });

  it("restores the demo account", async () => {
    const profile = await createDemoProfile();

    await restoreDemoAccountOnLogin(` ${DEMO_EMAIL.toUpperCase()} `);

    expect(await RampState.count({ where: { userId: profile.id } })).toBe(4);
  });
});
