import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type Address,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  InsufficientFundsError,
  parseAbi
} from "viem";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumAccountRegistration, {
  MoneriumAccountRegistrationStatus
} from "../../../models/moneriumAccountRegistration.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { MoneriumB2bProvisioningError, provisionMoneriumB2bAccount } from "./account-provisioning";
import { refundAccountFor } from "./refund-wallet";
import { advanceRegistrations, DEPLOYMENT_RESEND_AFTER_MS, type RegistrationDeps, registrationSalt } from "./registration";

const PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
const factoryErrors = parseAbi(["error NotDeployer()", "error InvalidConfigAddress()", "error CloneFailed()"]);

function revert(errorName: "NotDeployer" | "InvalidConfigAddress" | "CloneFailed"): ContractFunctionRevertedError {
  return new ContractFunctionRevertedError({
    abi: factoryErrors,
    data: encodeErrorResult({ abi: factoryErrors, errorName }),
    functionName: "deployForwarder"
  });
}

interface FakeOptions {
  deployed?: boolean;
  deployError?: Error;
  provision?: RegistrationDeps["provision"];
  receipt?: "pending" | "reverted" | "success";
  /** One state for every profile; an Error is thrown, null is "not visible". */
  state?: string | null | Error;
}

function fakeDeps(options: FakeOptions = {}) {
  const deployed = new Set<string>(options.deployed ? [FORWARDER] : []);
  const deploys: Array<[Address, Address, Hex]> = [];
  const predictions: Array<[Address, Address, Hex]> = [];
  // The main registration's clone is FORWARDER; any other salt gets its own address.
  const forwarderOf = (salt: Hex) =>
    salt === registrationSalt(PROFILE, DESTINATION) ? FORWARDER : (`0x${salt.slice(26)}` as Address);
  const deps: RegistrationDeps = {
    async deploy(destination, recoveryAddress, salt) {
      if (options.deployError) throw options.deployError;
      deploys.push([destination, recoveryAddress, salt]);
      deployed.add(forwarderOf(salt));
      return "0xdeploy";
    },
    isForwarder: async address => deployed.has(address),
    async predictAddress(destination, recoveryAddress, salt) {
      predictions.push([destination, recoveryAddress, salt]);
      return forwarderOf(salt);
    },
    async profileState() {
      const state = options.state === undefined ? "approved" : options.state;
      if (state instanceof Error) throw state;
      return state as never;
    },
    provision: options.provision ?? provisionMoneriumB2bAccount,
    receiptStatus: async () => options.receipt ?? "success"
  };
  return { deploys, deps, predictions };
}

describe("advanceRegistrations", () => {
  const saved = {
    deployer: config.moneriumB2b.deployerPrivateKey,
    rpcUrl: config.moneriumB2b.rpcUrl,
    sandboxEnabled: config.sandboxEnabled
  };

  beforeAll(async () => {
    config.moneriumB2b.deployerPrivateKey = `0x${"44".repeat(32)}`;
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.deployerPrivateKey = saved.deployer;
    config.moneriumB2b.rpcUrl = saved.rpcUrl;
    config.sandboxEnabled = saved.sandboxEnabled;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.sandboxEnabled = false;
  });

  async function createManager(): Promise<string> {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    return manager.id;
  }

  async function requested(
    fields: Partial<MoneriumAccountRegistration> = {},
    managerProfileId?: string
  ): Promise<MoneriumAccountRegistration> {
    return MoneriumAccountRegistration.create({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      managerProfileId: managerProfileId ?? (await createManager()),
      moneriumProfileId: PROFILE,
      ...fields
    });
  }

  it("pins the CREATE2 salt encoding: a change would orphan every in-flight registration's clone", () => {
    expect(registrationSalt(PROFILE, DESTINATION)).toBe(
      "0x2921981540aa02af9cf59986af7a1b9ccd04dd82f5fac3e0d52dbbfadf464757"
    );
  });

  it("waits with a reason while Monerium has not approved or cannot show the profile, never rejecting", async () => {
    for (const [state, reason] of [
      ["pending", "monerium_profile_pending"],
      ["review", "monerium_profile_pending"],
      [null, "monerium_profile_not_visible"],
      [new Error("Monerium timed out"), "temporary_error"]
    ] as const) {
      await resetTestDatabase();
      const registration = await requested();
      const { deploys, deps } = fakeDeps({ state });
      await advanceRegistrations(deps);
      await registration.reload();
      expect(registration).toMatchObject({ status: MoneriumAccountRegistrationStatus.Requested, waitingReason: reason });
      expect(registration.lastCheckedAt).not.toBeNull();
      expect(deploys).toHaveLength(0);
    }
  });

  it("rejects when Monerium rejects or closes the profile", async () => {
    for (const [state, reason] of [
      ["rejected", "Monerium rejected the profile"],
      ["closed", "Monerium closed the profile"]
    ] as const) {
      await resetTestDatabase();
      const registration = await requested();
      await advanceRegistrations(fakeDeps({ state }).deps);
      await registration.reload();
      expect(registration).toMatchObject({
        rejectedReason: reason,
        status: MoneriumAccountRegistrationStatus.Rejected,
        waitingReason: null
      });
    }
  });

  it("deploys the forwarder once with the client's refund wallet and maps the account", async () => {
    const registration = await requested();
    const { deploys, deps, predictions } = fakeDeps();
    await advanceRegistrations(deps); // deploys; the next cycle finds the clone and maps it
    await registration.reload();
    expect(registration).toMatchObject({
      deployTxHash: "0xdeploy",
      status: MoneriumAccountRegistrationStatus.Requested,
      waitingReason: "deployment_pending"
    });
    expect(registration.deploySentAt).not.toBeNull();
    await advanceRegistrations(deps);
    await advanceRegistrations(deps);

    const call = [DESTINATION, refundAccountFor(PROFILE).address, registrationSalt(PROFILE, DESTINATION)];
    expect(deploys).toEqual([call] as never);
    expect(predictions[0]).toEqual(call as never);
    await registration.reload();
    expect(registration).toMatchObject({
      deployTxHash: "0xdeploy",
      status: MoneriumAccountRegistrationStatus.Mapped,
      waitingReason: null
    });
    const account = await MoneriumAccount.findByPk(registration.accountId as string);
    expect(account).toMatchObject({
      destination: DESTINATION,
      forwarderAddress: FORWARDER,
      profileId: PROFILE,
      status: MoneriumAccountStatus.Onboarding
    });
  });

  it("sends one deployment per cycle", async () => {
    const managerProfileId = await createManager();
    await requested({}, managerProfileId);
    const second = await requested(
      {
        contactEmail: "ops@second.example.com",
        destination: "0x3333333333333333333333333333333333333333",
        externalSubjectId: "client-2",
        moneriumProfileId: crypto.randomUUID()
      },
      managerProfileId
    );
    const { deploys, deps } = fakeDeps();

    await advanceRegistrations(deps);
    expect(deploys).toHaveLength(1);
    expect((await second.reload()).waitingReason).toBe("deployment_pending");
    await advanceRegistrations(deps);
    expect(deploys).toHaveLength(2);
  });

  it("checks the least recently checked registrations first, so waiting ones never starve newer ones", async () => {
    const managerProfileId = await createManager();
    for (let index = 0; index < 21; index += 1) {
      await requested(
        {
          contactEmail: `ops${index}@client.example.com`,
          externalSubjectId: `client-${index}`,
          moneriumProfileId: crypto.randomUUID()
        },
        managerProfileId
      );
    }
    const { deps } = fakeDeps({ state: "pending" });

    await advanceRegistrations(deps);
    expect(await MoneriumAccountRegistration.count({ where: { lastCheckedAt: null } })).toBe(1);
    await advanceRegistrations(deps);
    expect(await MoneriumAccountRegistration.count({ where: { lastCheckedAt: null } })).toBe(0);
  });

  it("adopts a clone deployed before a crash and waits for a deployment still in flight", async () => {
    const adopted = await requested({ deploySentAt: new Date(), deployTxHash: "0xearlier" });
    const crashed = fakeDeps({ deployed: true });
    await advanceRegistrations(crashed.deps);
    await adopted.reload();
    expect(adopted.status).toBe(MoneriumAccountRegistrationStatus.Mapped);
    expect(crashed.deploys).toHaveLength(0);

    await resetTestDatabase();
    const inFlight = await requested({ deploySentAt: new Date(), deployTxHash: "0xearlier" });
    const pending = fakeDeps({ receipt: "pending" });
    await advanceRegistrations(pending.deps);
    await inFlight.reload();
    expect(inFlight).toMatchObject({
      status: MoneriumAccountRegistrationStatus.Requested,
      waitingReason: "deployment_pending"
    });
    expect(pending.deploys).toHaveLength(0);
  });

  it("sends a deployment again when the last one reverted or has no receipt after the resend delay", async () => {
    for (const { receipt, sentAt } of [
      { receipt: "reverted" as const, sentAt: new Date() },
      { receipt: "pending" as const, sentAt: new Date(Date.now() - DEPLOYMENT_RESEND_AFTER_MS - 1000) }
    ]) {
      await resetTestDatabase();
      const registration = await requested({ deploySentAt: sentAt, deployTxHash: "0xdropped" });
      const { deploys, deps } = fakeDeps({ receipt });
      await advanceRegistrations(deps);
      expect(deploys).toHaveLength(1);
      expect((await registration.reload()).deployTxHash).toBe("0xdeploy");
    }
  });

  it("rejects a contract refusal of the arguments, but waits on the deployer's or the RPC's problems", async () => {
    const refused = await requested();
    await advanceRegistrations(fakeDeps({ deployError: revert("InvalidConfigAddress") }).deps);
    await refused.reload();
    expect(refused.status).toBe(MoneriumAccountRegistrationStatus.Rejected);
    expect(refused.rejectedReason).toBe("The forwarder factory refused the deployment (InvalidConfigAddress)");

    for (const [deployError, reason] of [
      [revert("NotDeployer"), "deployer_not_ready"],
      [new InsufficientFundsError(), "deployer_not_ready"],
      [revert("CloneFailed"), "deployment_pending"],
      // An RPC error viem wraps as a revert without decodable data, and a plain transport error.
      [new ContractFunctionRevertedError({ abi: factoryErrors, functionName: "deployForwarder" }), "temporary_error"],
      [new Error("socket hang up"), "temporary_error"]
    ] as const) {
      await resetTestDatabase();
      const registration = await requested();
      await advanceRegistrations(fakeDeps({ deployError }).deps);
      await registration.reload();
      expect(registration).toMatchObject({ status: MoneriumAccountRegistrationStatus.Requested, waitingReason: reason });
    }
  });

  it("waits on a retryable mapping failure or an inactive manager, and rejects a definite conflict", async () => {
    const retryable = await requested();
    const transient = fakeDeps({
      deployed: true,
      provision: async () => {
        throw new MoneriumB2bProvisioningError("MONERIUM_B2B_ACCOUNT_CONFLICT", "Could not verify the forwarder on chain", true);
      }
    });
    await advanceRegistrations(transient.deps);
    expect(await retryable.reload()).toMatchObject({
      status: MoneriumAccountRegistrationStatus.Requested,
      waitingReason: "temporary_error"
    });

    await resetTestDatabase();
    const inactive = await requested();
    await ManagedProfileManager.update({ isActive: false }, { where: { profileId: inactive.managerProfileId } });
    await advanceRegistrations(fakeDeps({ deployed: true }).deps);
    expect(await inactive.reload()).toMatchObject({
      status: MoneriumAccountRegistrationStatus.Requested,
      waitingReason: "manager_inactive"
    });

    await resetTestDatabase();
    const conflicting = await requested();
    const definite = fakeDeps({
      deployed: true,
      provision: async () => {
        throw new MoneriumB2bProvisioningError("MONERIUM_B2B_ACCOUNT_CONFLICT", "Deployed forwarder verification failed");
      }
    });
    await advanceRegistrations(definite.deps);
    expect(await conflicting.reload()).toMatchObject({
      rejectedReason: "Deployed forwarder verification failed",
      status: MoneriumAccountRegistrationStatus.Rejected
    });
  });

  it("rejects a client conflict before paying for a deployment", async () => {
    const registration = await requested();
    await provisionMoneriumB2bAccount({
      contactEmail: "someone-else@client.example.com",
      destination: "0x3333333333333333333333333333333333333333",
      externalSubjectId: "client-1",
      forwarderAddress: "0x4444444444444444444444444444444444444444",
      managerProfileId: registration.managerProfileId,
      moneriumProfileId: crypto.randomUUID()
    });
    const { deploys, deps } = fakeDeps();
    await advanceRegistrations(deps);
    await registration.reload();
    expect(registration.status).toBe(MoneriumAccountRegistrationStatus.Rejected);
    expect(registration.rejectedReason).toContain("different contact email");
    expect(deploys).toHaveLength(0);
  });

  it("adopts an account an operator mapped by hand, or rejects it when its destination differs", async () => {
    for (const [destination, status] of [
      [DESTINATION, MoneriumAccountRegistrationStatus.Mapped],
      ["0x3333333333333333333333333333333333333333", MoneriumAccountRegistrationStatus.Rejected]
    ] as const) {
      await resetTestDatabase();
      const registration = await requested();
      const operator = await provisionMoneriumB2bAccount({
        contactEmail: "ops@client.example.com",
        destination,
        externalSubjectId: "client-1",
        forwarderAddress: "0x5555555555555555555555555555555555555555",
        managerProfileId: registration.managerProfileId,
        moneriumProfileId: PROFILE
      });
      const { deploys, deps } = fakeDeps();
      await advanceRegistrations(deps);
      await registration.reload();
      expect(registration.status).toBe(status);
      expect(registration.accountId).toBe(status === MoneriumAccountRegistrationStatus.Mapped ? operator.accountId : null);
      expect(deploys).toHaveLength(0);
    }
  });

  it("activates only registered onboarding accounts with an IBAN, and only in the sandbox", async () => {
    const managerProfileId = await createManager();
    const registration = await requested({}, managerProfileId);
    const { deps } = fakeDeps();
    await advanceRegistrations(deps); // deploy
    await advanceRegistrations(deps); // map
    await registration.reload();
    const account = (await MoneriumAccount.findByPk(registration.accountId as string)) as MoneriumAccount;
    const adminMapped = await provisionMoneriumB2bAccount({
      contactEmail: "ops@admin.example.com",
      destination: "0x3333333333333333333333333333333333333333",
      externalSubjectId: "client-admin",
      forwarderAddress: "0x6666666666666666666666666666666666666666",
      managerProfileId,
      moneriumProfileId: crypto.randomUUID()
    });
    await MoneriumAccount.update({ iban: "EE08 7224 5745 6244 9516" }, { where: { id: adminMapped.accountId } });

    config.sandboxEnabled = true;
    await advanceRegistrations(deps); // no IBAN yet
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Onboarding);

    await account.update({ iban: "EE38 2200 2210 2014 5685" });
    config.sandboxEnabled = false;
    await advanceRegistrations(deps);
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Onboarding);

    config.sandboxEnabled = true;
    await advanceRegistrations(deps);
    await account.reload();
    expect(account.status).toBe(MoneriumAccountStatus.Active);
    expect(account.activatedAt).not.toBeNull();
    expect((await MoneriumAccount.findByPk(adminMapped.accountId))?.status).toBe(MoneriumAccountStatus.Onboarding);

    await account.update({ status: MoneriumAccountStatus.Suspended });
    await advanceRegistrations(deps);
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Suspended);
  });
});
