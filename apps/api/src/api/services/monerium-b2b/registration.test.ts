import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { type Address, ContractFunctionRevertedError, encodeErrorResult, type Hex, parseAbi } from "viem";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumAccountRegistration, {
  MoneriumAccountRegistrationStatus
} from "../../../models/moneriumAccountRegistration.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import { refundAccountFor } from "./refund-wallet";
import { advanceRegistrations, type RegistrationDeps, registrationSalt } from "./registration";

const PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
const factoryErrors = parseAbi(["error NotDeployer()", "error InvalidConfigAddress()"]);

function revert(errorName: "NotDeployer" | "InvalidConfigAddress"): ContractFunctionRevertedError {
  return new ContractFunctionRevertedError({
    abi: factoryErrors,
    data: encodeErrorResult({ abi: factoryErrors, errorName }),
    functionName: "deployForwarder"
  });
}

function fakeDeps(state: string, options: { deployed?: boolean; deployError?: Error; receipt?: "pending" | "success" } = {}) {
  let deployed = options.deployed ?? false;
  const deploys: Array<[Address, Address, Hex]> = [];
  const deps: RegistrationDeps = {
    async deploy(destination, recoveryAddress, salt) {
      if (options.deployError) throw options.deployError;
      deploys.push([destination, recoveryAddress, salt]);
      deployed = true;
      return "0xdeploy";
    },
    isForwarder: async () => deployed,
    predictAddress: async () => FORWARDER,
    profileState: async () => state as never,
    provision: provisionMoneriumB2bAccount,
    receiptStatus: async () => options.receipt ?? "success"
  };
  return { deploys, deps };
}

describe("advanceRegistrations", () => {
  const saved = {
    deployer: config.moneriumB2b.deployerPrivateKey,
    deploymentEnv: config.deploymentEnv,
    rpcUrl: config.moneriumB2b.rpcUrl
  };

  beforeAll(async () => {
    config.moneriumB2b.deployerPrivateKey = `0x${"44".repeat(32)}`;
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.deployerPrivateKey = saved.deployer;
    config.moneriumB2b.rpcUrl = saved.rpcUrl;
    config.deploymentEnv = saved.deploymentEnv;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.deploymentEnv = saved.deploymentEnv;
  });

  async function requested(fields: Partial<MoneriumAccountRegistration> = {}): Promise<MoneriumAccountRegistration> {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    return MoneriumAccountRegistration.create({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      managerProfileId: manager.id,
      moneriumProfileId: PROFILE,
      ...fields
    });
  }

  it("waits until Monerium approves the profile", async () => {
    const registration = await requested();
    const { deploys, deps } = fakeDeps("pending");
    await advanceRegistrations(deps);
    await registration.reload();
    expect(registration.status).toBe(MoneriumAccountRegistrationStatus.Requested);
    expect(deploys).toHaveLength(0);
  });

  it("deploys the forwarder once with the client's refund wallet and maps the account", async () => {
    const registration = await requested();
    const { deploys, deps } = fakeDeps("approved");
    await advanceRegistrations(deps); // deploys; the next cycle finds the clone and maps it
    await registration.reload();
    expect(registration).toMatchObject({ deployTxHash: "0xdeploy", status: MoneriumAccountRegistrationStatus.Requested });
    await advanceRegistrations(deps);
    await advanceRegistrations(deps);

    expect(deploys).toEqual([[DESTINATION, refundAccountFor(PROFILE).address, registrationSalt(PROFILE, DESTINATION)]]);
    await registration.reload();
    expect(registration).toMatchObject({ deployTxHash: "0xdeploy", status: MoneriumAccountRegistrationStatus.Mapped });
    const account = await MoneriumAccount.findByPk(registration.accountId as string);
    expect(account).toMatchObject({
      destination: DESTINATION,
      forwarderAddress: FORWARDER,
      profileId: PROFILE,
      status: MoneriumAccountStatus.Onboarding
    });
  });

  it("adopts a clone deployed before a crash and waits for a deployment still in flight", async () => {
    const adopted = await requested({ deployTxHash: "0xearlier" });
    const crashed = fakeDeps("approved", { deployed: true });
    await advanceRegistrations(crashed.deps);
    await adopted.reload();
    expect(adopted.status).toBe(MoneriumAccountRegistrationStatus.Mapped);
    expect(crashed.deploys).toHaveLength(0);

    await resetTestDatabase();
    const inFlight = await requested({ deployTxHash: "0xearlier" });
    const pending = fakeDeps("approved", { receipt: "pending" });
    await advanceRegistrations(pending.deps);
    await inFlight.reload();
    expect(inFlight.status).toBe(MoneriumAccountRegistrationStatus.Requested);
    expect(pending.deploys).toHaveLength(0);
  });

  it("rejects on Monerium's rejection and on a contract refusal, but retries a missing deployer role", async () => {
    const rejectedProfile = await requested();
    await advanceRegistrations(fakeDeps("rejected").deps);
    await rejectedProfile.reload();
    expect(rejectedProfile).toMatchObject({
      rejectedReason: "Monerium rejected the profile",
      status: MoneriumAccountRegistrationStatus.Rejected
    });

    await resetTestDatabase();
    const refused = await requested();
    await advanceRegistrations(fakeDeps("approved", { deployError: revert("InvalidConfigAddress") }).deps);
    await refused.reload();
    expect(refused.status).toBe(MoneriumAccountRegistrationStatus.Rejected);
    expect(refused.rejectedReason).toContain("InvalidConfigAddress");

    await resetTestDatabase();
    const misconfigured = await requested();
    await advanceRegistrations(fakeDeps("approved", { deployError: revert("NotDeployer") }).deps);
    await misconfigured.reload();
    expect(misconfigured.status).toBe(MoneriumAccountRegistrationStatus.Requested);
  });

  it("activates a registered account once its IBAN is issued, except in production", async () => {
    const registration = await requested();
    const { deps } = fakeDeps("approved");
    await advanceRegistrations(deps); // deploy
    await advanceRegistrations(deps); // map
    await registration.reload();
    const account = (await MoneriumAccount.findByPk(registration.accountId as string)) as MoneriumAccount;

    await advanceRegistrations(deps); // no IBAN yet
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Onboarding);

    await account.update({ iban: "EE08 7224 5745 6244 9516" });
    config.deploymentEnv = "production";
    await advanceRegistrations(deps);
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Onboarding);

    config.deploymentEnv = "sandbox";
    await advanceRegistrations(deps);
    expect((await account.reload()).status).toBe(MoneriumAccountStatus.Active);
  });
});
