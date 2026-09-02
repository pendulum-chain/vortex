import { type Address, parseAbi } from "viem";
import sequelize from "../../../config/database";
import { config } from "../../../config/vars";
import KycCase from "../../../models/kycCase.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { type ProvisionManagedProfileResult, provisionManagedProfile } from "../managed-profile-provisioning.service";
import { getPublicClient } from "./chain";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MoneriumB2bProvisioningError extends Error {
  constructor(
    readonly code: "MONERIUM_B2B_ACCOUNT_CONFLICT" | "MONERIUM_B2B_INVALID_INPUT",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface ProvisionMoneriumB2bAccountInput {
  contactEmail: string;
  destination: string;
  externalSubjectId: string;
  fallbackAddress: string;
  feeBps?: number;
  forwarderAddress: string;
  managerProfileId: string;
  moneriumProfileId: string;
}

export interface ProvisionMoneriumB2bAccountResult {
  accountId: string;
  accountStatus: MoneriumAccountStatus;
  created: boolean;
  customerEntityId: string;
  iban: string | null;
  moneriumProfileId: string;
  profileId: string;
}

function normalizeAddress(value: string, name: string): string {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value.trim())) {
    throw new MoneriumB2bProvisioningError("MONERIUM_B2B_INVALID_INPUT", `${name} must be a 0x-prefixed EVM address`);
  }
  return value.trim().toLowerCase();
}

const forwarderConfigAbi = parseAbi([
  "function destination() view returns (address)",
  "function fallbackAddress() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function FACTORY() view returns (address)"
]);
const factoryRegistryAbi = parseAbi(["function isForwarder(address forwarder) view returns (bool)"]);

/** Pure comparison of the submitted account data against the deployed clone's config. */
export function forwarderConfigMismatch(
  expected: { destination: string; fallbackAddress: string; feeBps: number },
  onchain: { destination: string; fallbackAddress: string; feeBps: number; isForwarder: boolean }
): string | null {
  if (!onchain.isForwarder) {
    return "the address is not a clone registered by its factory";
  }
  if (onchain.destination.toLowerCase() !== expected.destination) {
    return `on-chain destination ${onchain.destination} differs from the submitted value`;
  }
  if (onchain.fallbackAddress.toLowerCase() !== expected.fallbackAddress) {
    return `on-chain fallbackAddress ${onchain.fallbackAddress} differs from the submitted value`;
  }
  if (onchain.feeBps !== expected.feeBps) {
    return `on-chain feeBps ${onchain.feeBps} differs from the submitted ${expected.feeBps}`;
  }
  return null;
}

/**
 * Verifies the operator-submitted forwarder against the chain before anything is
 * persisted: a mistyped or wrong clone address would otherwise be linked to the
 * client's Monerium profile within a keeper cycle, and the R07 monitor would adopt
 * the wrong clone's destination as owner-authorized. Skipped when no read RPC is
 * configured (sandbox / pre-chain environments — the association and config monitors
 * remain the detective controls there).
 */
async function verifyForwarderOnChain(
  forwarderAddress: string,
  destination: string,
  fallbackAddress: string,
  feeBps: number
): Promise<void> {
  if (!config.moneriumB2b.rpcUrl) {
    return;
  }
  const client = getPublicClient();
  const address = forwarderAddress as Address;
  let onchain: { destination: string; fallbackAddress: string; feeBps: number; isForwarder: boolean };
  try {
    const [onchainDestination, onchainFallback, onchainFeeBps, factory] = await Promise.all([
      client.readContract({ abi: forwarderConfigAbi, address, functionName: "destination" }),
      client.readContract({ abi: forwarderConfigAbi, address, functionName: "fallbackAddress" }),
      client.readContract({ abi: forwarderConfigAbi, address, functionName: "feeBps" }),
      client.readContract({ abi: forwarderConfigAbi, address, functionName: "FACTORY" })
    ]);
    const isForwarder = await client.readContract({
      abi: factoryRegistryAbi,
      address: factory,
      args: [address],
      functionName: "isForwarder"
    });
    onchain = { destination: onchainDestination, fallbackAddress: onchainFallback, feeBps: onchainFeeBps, isForwarder };
  } catch (error) {
    throw new MoneriumB2bProvisioningError(
      "MONERIUM_B2B_ACCOUNT_CONFLICT",
      `Could not verify the forwarder on chain (is the address a deployed clone? retry if the RPC was unavailable): ${
        error instanceof Error ? error.message.slice(0, 200) : String(error)
      }`
    );
  }
  const mismatch = forwarderConfigMismatch({ destination, fallbackAddress, feeBps }, onchain);
  if (mismatch) {
    throw new MoneriumB2bProvisioningError(
      "MONERIUM_B2B_ACCOUNT_CONFLICT",
      `Deployed forwarder verification failed: ${mismatch}`
    );
  }
}

// Mirrors the whitelabel KYB outcome for a reliance-onboarded corporate: these
// profiles are onboarded and approved on Monerium's side before they are mapped
// here, so the local provider records are imported directly as approved
// (docs/operations-monerium-interface.md, profile lifecycle).
async function mirrorApprovedKyb(customerEntityId: string, moneriumProfileId: string): Promise<void> {
  await sequelize.transaction(async transaction => {
    const boundElsewhere = await ProviderCustomer.findOne({
      transaction,
      where: { provider: "monerium", providerCustomerId: moneriumProfileId }
    });
    if (boundElsewhere && boundElsewhere.customerEntityId !== customerEntityId) {
      throw new MoneriumB2bProvisioningError(
        "MONERIUM_B2B_ACCOUNT_CONFLICT",
        "The Monerium profile is already bound to a different customer"
      );
    }

    const [customer] = await ProviderCustomer.findOrCreate({
      defaults: {
        customerEntityId,
        customerType: "business",
        provider: "monerium",
        providerCustomerId: moneriumProfileId,
        rail: "eur",
        status: VerificationStatus.Approved,
        statusExternal: "approved"
      },
      transaction,
      where: { customerEntityId, customerType: "business", provider: "monerium", rail: "eur" }
    });
    if (customer.providerCustomerId && customer.providerCustomerId !== moneriumProfileId) {
      throw new MoneriumB2bProvisioningError(
        "MONERIUM_B2B_ACCOUNT_CONFLICT",
        "The customer entity is already bound to a different Monerium profile"
      );
    }
    if (customer.providerCustomerId !== moneriumProfileId || customer.status !== VerificationStatus.Approved) {
      await customer.update(
        { providerCustomerId: moneriumProfileId, status: VerificationStatus.Approved, statusExternal: "approved" },
        { transaction }
      );
    }

    const existingCase = await KycCase.findOne({ transaction, where: { providerCustomerId: customer.id } });
    if (existingCase) {
      if (existingCase.status !== VerificationStatus.Approved) {
        await existingCase.update(
          {
            approvedAt: existingCase.approvedAt ?? new Date(),
            providerCaseId: moneriumProfileId,
            rejectedAt: null,
            status: VerificationStatus.Approved,
            statusExternal: "approved"
          },
          { transaction }
        );
      }
    } else {
      await KycCase.create(
        {
          approvedAt: new Date(),
          customerEntityId,
          provider: "monerium",
          providerCaseId: moneriumProfileId,
          providerCustomerId: customer.id,
          status: VerificationStatus.Approved,
          statusExternal: "approved",
          submittedAt: new Date(),
          type: "kyb"
        },
        { transaction }
      );
    }
  });
}

function accountMatchesInput(
  account: MoneriumAccount,
  childProfileId: string,
  forwarderAddress: string,
  destination: string,
  fallbackAddress: string,
  feeBps: number
): boolean {
  return (
    account.forwarderAddress.toLowerCase() === forwarderAddress &&
    account.destination.toLowerCase() === destination &&
    account.fallbackAddress.toLowerCase() === fallbackAddress &&
    account.feeBps === feeBps &&
    (account.vortexProfileId === null || account.vortexProfileId === childProfileId)
  );
}

/**
 * Maps a corporate that Monerium onboarded to the whitelabel app onto a Vortex
 * managed profile and its B2B onramp account. Idempotent: replaying the same
 * input returns the existing records; any divergence is a conflict, never an
 * overwrite. The forwarder clone must already be deployed (operator runbook);
 * this only records it.
 */
export async function provisionMoneriumB2bAccount(
  input: ProvisionMoneriumB2bAccountInput
): Promise<ProvisionMoneriumB2bAccountResult> {
  const moneriumProfileId = input.moneriumProfileId.trim().toLowerCase();
  if (!UUID_PATTERN.test(moneriumProfileId)) {
    throw new MoneriumB2bProvisioningError("MONERIUM_B2B_INVALID_INPUT", "moneriumProfileId must be a UUID");
  }
  const forwarderAddress = normalizeAddress(input.forwarderAddress, "forwarderAddress");
  const destination = normalizeAddress(input.destination, "destination");
  const fallbackAddress = normalizeAddress(input.fallbackAddress, "fallbackAddress");
  const feeBps = input.feeBps ?? 0;
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new MoneriumB2bProvisioningError("MONERIUM_B2B_INVALID_INPUT", "feeBps must be an integer between 0 and 10000");
  }

  // Before any persistence: a wrong clone address must fail here, not become a mapped
  // account whose config the monitors later legitimize.
  await verifyForwarderOnChain(forwarderAddress, destination, fallbackAddress, feeBps);

  // The pilot reliance scope is KYB'd corporates only, so the child is always a
  // business entity. Errors (inactive manager, subject/email conflicts) propagate
  // as ManagedProfileProvisioningError for the controller to map.
  const managedProfile: ProvisionManagedProfileResult = await provisionManagedProfile({
    contactEmail: input.contactEmail,
    creationSource: "vortex",
    customerType: "business",
    externalSubjectId: input.externalSubjectId,
    managerProfileId: input.managerProfileId
  });

  await mirrorApprovedKyb(managedProfile.customerEntityId, moneriumProfileId);

  const account = await sequelize.transaction(async transaction => {
    const existing = await MoneriumAccount.findOne({ transaction, where: { profileId: moneriumProfileId } });
    if (existing) {
      if (!accountMatchesInput(existing, managedProfile.profileId, forwarderAddress, destination, fallbackAddress, feeBps)) {
        throw new MoneriumB2bProvisioningError(
          "MONERIUM_B2B_ACCOUNT_CONFLICT",
          "The Monerium profile is already mapped with different account data"
        );
      }
      // Adopt a pre-mapping row that was inserted by hand before the managed
      // profile linkage existed.
      if (existing.vortexProfileId === null) {
        await existing.update({ vortexProfileId: managedProfile.profileId }, { transaction });
      }
      return { created: false, row: existing };
    }

    const boundToProfile = await MoneriumAccount.findOne({
      transaction,
      where: { vortexProfileId: managedProfile.profileId }
    });
    if (boundToProfile) {
      throw new MoneriumB2bProvisioningError(
        "MONERIUM_B2B_ACCOUNT_CONFLICT",
        "The managed profile already has a Monerium account for a different Monerium profile"
      );
    }
    const forwarderTaken = await MoneriumAccount.findOne({ transaction, where: { forwarderAddress } });
    if (forwarderTaken) {
      throw new MoneriumB2bProvisioningError(
        "MONERIUM_B2B_ACCOUNT_CONFLICT",
        "The forwarder address is already bound to another account"
      );
    }

    const row = await MoneriumAccount.create(
      {
        destination,
        fallbackAddress,
        feeBps,
        forwarderAddress,
        profileId: moneriumProfileId,
        status: MoneriumAccountStatus.Onboarding,
        vortexProfileId: managedProfile.profileId
      },
      { transaction }
    );
    return { created: true, row };
  });

  return {
    accountId: account.row.id,
    accountStatus: account.row.status,
    created: account.created,
    customerEntityId: managedProfile.customerEntityId,
    iban: account.row.iban,
    moneriumProfileId,
    profileId: managedProfile.profileId
  };
}
