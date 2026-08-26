import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { config } from "../../../config/vars";
import FinancialOperation from "../../../models/financialOperation.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionManagedProfile } from "../managed-profile-provisioning.service";
import { processMoneriumWebhookInbox } from "./deposit-processor";
import { advanceOnboardingAccounts, type OnboardingDeps } from "./onboarding";

const FORWARDER = "0x1111111111111111111111111111111111111111";
const DESTINATION = "0x2222222222222222222222222222222222222222";
const FALLBACK = "0x3333333333333333333333333333333333333333";
const MONERIUM_PROFILE = "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e";
const IBAN = "EE08 7224 5745 6244 9516";

const savedConfig = { ...config.moneriumB2b };

interface FakeDeps extends OnboardingDeps {
  calls: { getChainId: number; getIbanForAddress: number; getProfileAddresses: number; linkAddress: unknown[][]; requestIban: unknown[][]; signLinkAttestation: unknown[][] };
  ibanByAddress: Map<string, string>;
  linkedAddresses: Set<string>;
}

function fakeDeps(): FakeDeps {
  const deps: FakeDeps = {
    calls: { getChainId: 0, getIbanForAddress: 0, getProfileAddresses: 0, linkAddress: [], requestIban: [], signLinkAttestation: [] },
    async getChainId() {
      deps.calls.getChainId += 1;
      return 1;
    },
    async getIbanForAddress(address: string) {
      deps.calls.getIbanForAddress += 1;
      const iban = deps.ibanByAddress.get(address.toLowerCase());
      return iban ? { iban } : null;
    },
    async getProfileAddresses() {
      deps.calls.getProfileAddresses += 1;
      return [...deps.linkedAddresses];
    },
    ibanByAddress: new Map(),
    async linkAddress(...args: unknown[]) {
      deps.calls.linkAddress.push(args);
      return {};
    },
    linkedAddresses: new Set(),
    async requestIban(...args: unknown[]) {
      deps.calls.requestIban.push(args);
      return {};
    },
    async signLinkAttestation(...args: unknown[]) {
      deps.calls.signLinkAttestation.push(args);
      return { signature: "0xattestor-signature" };
    }
  };
  return deps;
}

async function createMappedAccount(overrides: Partial<Parameters<typeof MoneriumAccount.create>[0]> = {}): Promise<MoneriumAccount> {
  const manager = await createTestUser();
  await ManagedProfileManager.create({
    allowedCorridors: ["EU"],
    allowedCustomerTypes: ["business"],
    isActive: true,
    profileId: manager.id
  });
  const child = await provisionManagedProfile({
    contactEmail: `client-${crypto.randomUUID()}@example.com`,
    creationSource: "vortex",
    customerType: "business",
    externalSubjectId: crypto.randomUUID(),
    managerProfileId: manager.id
  });
  return MoneriumAccount.create({
    destination: DESTINATION,
    fallbackAddress: FALLBACK,
    feeBps: 0,
    forwarderAddress: FORWARDER,
    profileId: MONERIUM_PROFILE,
    vortexProfileId: child.profileId,
    ...overrides
  });
}

describe("monerium b2b onboarding automation", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.moneriumB2b.attestorPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    config.moneriumB2b.clientId = "test-client-id";
    config.moneriumB2b.clientSecret = "test-client-secret";
    config.moneriumB2b.rpcUrl = "http://rpc.invalid";
  });

  afterAll(() => {
    Object.assign(config.moneriumB2b, savedConfig);
  });

  it("links the forwarder and requests an IBAN through the financial-operation ledger", async () => {
    const account = await createMappedAccount();
    const deps = fakeDeps();

    expect(await advanceOnboardingAccounts(deps)).toBe(1);

    expect(deps.calls.signLinkAttestation).toEqual([[1n, FORWARDER]]);
    expect(deps.calls.linkAddress).toEqual([[MONERIUM_PROFILE, FORWARDER, "ethereum", "0xattestor-signature"]]);
    expect(deps.calls.requestIban).toEqual([[FORWARDER, "ethereum"]]);

    const ownerProfileId = account.vortexProfileId as string;
    const operations = await FinancialOperation.findAll({ order: [["phase", "ASC"]] });
    expect(operations.map(op => ({ phase: op.phase, scopeId: op.scopeId, scopeType: op.scopeType, status: op.status }))).toEqual([
      { phase: "linkAddress", scopeId: ownerProfileId, scopeType: "profile", status: "confirmed" },
      { phase: "requestIban", scopeId: ownerProfileId, scopeType: "profile", status: "confirmed" }
    ]);
  });

  it("never repeats a claimed provider write on replay", async () => {
    await createMappedAccount();
    const deps = fakeDeps();

    await advanceOnboardingAccounts(deps);
    // Simulate the next cycle before the link/IBAN become visible upstream.
    await advanceOnboardingAccounts(deps);

    expect(deps.calls.linkAddress).toHaveLength(1);
    expect(deps.calls.requestIban).toHaveLength(1);
  });

  it("skips the link call when the forwarder is already linked upstream", async () => {
    await createMappedAccount();
    const deps = fakeDeps();
    deps.linkedAddresses.add(FORWARDER);

    await advanceOnboardingAccounts(deps);

    expect(deps.calls.linkAddress).toHaveLength(0);
    expect(deps.calls.requestIban).toHaveLength(1);
  });

  it("records the IBAN once issuance completes", async () => {
    const account = await createMappedAccount();
    const deps = fakeDeps();
    deps.linkedAddresses.add(FORWARDER);
    deps.ibanByAddress.set(FORWARDER, IBAN);

    await advanceOnboardingAccounts(deps);

    await account.reload();
    expect(account.iban).toBe(IBAN);
    expect(deps.calls.requestIban).toHaveLength(0);
  });

  it("only advances mapped accounts still in onboarding", async () => {
    await createMappedAccount({ status: MoneriumAccountStatus.Active });
    await MoneriumAccount.create({
      destination: DESTINATION,
      fallbackAddress: FALLBACK,
      feeBps: 0,
      forwarderAddress: "0x9999999999999999999999999999999999999999",
      profileId: crypto.randomUUID()
      // no vortexProfileId: pre-mapping row stays operator-managed
    });
    const deps = fakeDeps();

    expect(await advanceOnboardingAccounts(deps)).toBe(0);
    expect(deps.calls.getChainId).toBe(0);
    expect(deps.calls.linkAddress).toHaveLength(0);
  });

  it("retries a failed link next cycle without wedging the ledger row", async () => {
    await createMappedAccount();
    const deps = fakeDeps();
    let failNext = true;
    const workingLinkAddress = deps.linkAddress.bind(deps);
    deps.linkAddress = async (profileId, address, chain, signature) => {
      if (failNext) {
        failNext = false;
        throw new Error("Monerium request failed");
      }
      return workingLinkAddress(profileId, address, chain, signature);
    };

    // First cycle: the link call fails with no side effect; the row must not be
    // parked in a state that requires manual reconciliation.
    await advanceOnboardingAccounts(deps);
    const afterFailure = await FinancialOperation.findOne({ where: { phase: "linkAddress" } });
    expect(afterFailure?.status).toBe("failed");

    // Second cycle: clean retry performs the call again and confirms.
    await advanceOnboardingAccounts(deps);
    const afterRetry = await FinancialOperation.findOne({ where: { phase: "linkAddress" } });
    expect(afterRetry?.status).toBe("confirmed");
    expect(deps.calls.linkAddress).toHaveLength(1);
  });

  it("reconciles an interrupted link from upstream state instead of re-posting", async () => {
    await createMappedAccount();
    const deps = fakeDeps();
    deps.linkAddress = async () => {
      // The POST landed upstream but the response was lost mid-flight.
      deps.linkedAddresses.add(FORWARDER);
      throw new Error("socket hang up");
    };

    await advanceOnboardingAccounts(deps);

    const operation = await FinancialOperation.findOne({ where: { phase: "linkAddress" } });
    expect(operation?.status).toBe("confirmed");
    expect(deps.calls.signLinkAttestation).toHaveLength(1);
  });

  it("retries a failed iban request next cycle", async () => {
    await createMappedAccount();
    const deps = fakeDeps();
    deps.linkedAddresses.add(FORWARDER);
    let failNext = true;
    const workingRequestIban = deps.requestIban.bind(deps);
    deps.requestIban = async (address, chain) => {
      if (failNext) {
        failNext = false;
        throw new Error("Monerium request failed");
      }
      return workingRequestIban(address, chain);
    };

    await advanceOnboardingAccounts(deps);
    expect((await FinancialOperation.findOne({ where: { phase: "requestIban" } }))?.status).toBe("failed");

    await advanceOnboardingAccounts(deps);
    expect((await FinancialOperation.findOne({ where: { phase: "requestIban" } }))?.status).toBe("confirmed");
    expect(deps.calls.requestIban).toHaveLength(1);
  });

  it("does nothing while the whitelabel credentials are not configured", async () => {
    await createMappedAccount();
    config.moneriumB2b.clientId = "";
    const deps = fakeDeps();

    expect(await advanceOnboardingAccounts(deps)).toBe(0);
    expect(deps.calls.getProfileAddresses).toBe(0);
  });
});

describe("iban.updated inbox recording", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("records the issued IBAN on the account and never overwrites a different one", async () => {
    const account = await createMappedAccount();
    await MoneriumWebhookEvent.create({
      eventId: "evt-iban-1",
      payload: { data: { address: FORWARDER, chain: "ethereum", iban: IBAN }, type: "iban.updated" }
    });

    await processMoneriumWebhookInbox();
    await account.reload();
    expect(account.iban).toBe(IBAN);

    // A later iban.updated with a different IBAN is an alert condition, not data.
    await MoneriumWebhookEvent.create({
      eventId: "evt-iban-2",
      payload: { data: { address: FORWARDER, chain: "ethereum", iban: "EE00 0000 0000 0000 0000" }, type: "iban.updated" }
    });
    await processMoneriumWebhookInbox();
    await account.reload();
    expect(account.iban).toBe(IBAN);

    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it("acks iban events for unknown forwarders without failing the drain", async () => {
    await MoneriumWebhookEvent.create({
      eventId: "evt-iban-3",
      payload: { data: { address: "0x8888888888888888888888888888888888888888", iban: IBAN }, type: "iban.updated" }
    });

    expect(await processMoneriumWebhookInbox()).toBe(1);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });
});
