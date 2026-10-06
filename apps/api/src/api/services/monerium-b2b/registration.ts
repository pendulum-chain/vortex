import { MoneriumApiError, MoneriumApiService, type MoneriumProfileState } from "@vortexfi/shared";
import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  type Hex,
  isAddress,
  keccak256,
  parseAbi,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress
} from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumAccountRegistration, {
  MoneriumAccountRegistrationStatus
} from "../../../models/moneriumAccountRegistration.model";
import { UUID_PATTERN } from "../../helpers/uuid";
import { ManagedProfileProvisioningError } from "../managed-profile-provisioning.service";
import {
  DEFAULT_FLOOR_PPM,
  DEFAULT_TARGET_PPM,
  MoneriumB2bProvisioningError,
  type ProvisionMoneriumB2bAccountInput,
  provisionMoneriumB2bAccount
} from "./account-provisioning";
import { getDeployerWalletClient, getPublicClient } from "./chain";
import { RECEIPT_TIMEOUT_MS } from "./conversion-executor";
import { refundAccountFor } from "./refund-wallet";

/**
 * Partner-registered destinations (docs/adr-0007-monerium-b2b-partner-registration.md):
 * the partner names a Monerium profile in its white-label app and the client's
 * destination; once Monerium approves the profile, the keeper deploys the client's
 * forwarder with the factory deployer key and maps the account through the same
 * verified path as the admin call. The destination is create-only.
 */

export class MoneriumB2bRegistrationError extends Error {
  constructor(
    readonly status: 400 | 409 | 422,
    readonly code: "MONERIUM_B2B_INVALID_INPUT" | "MONERIUM_B2B_DESTINATION_CONFLICT" | "MONERIUM_B2B_PROFILE_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export interface RegistrationSnapshot {
  moneriumProfileId: string;
  externalSubjectId: string;
  destination: string;
  /** `requested` until the account is mapped (`accountId` set) or the registration is rejected. */
  status: MoneriumAccountRegistrationStatus;
  rejectedReason: string | null;
  accountId: string | null;
  createdAt: string;
}

export function registrationSnapshot(registration: MoneriumAccountRegistration): RegistrationSnapshot {
  return {
    accountId: registration.accountId,
    createdAt: registration.createdAt.toISOString(),
    destination: registration.destination,
    externalSubjectId: registration.externalSubjectId,
    moneriumProfileId: registration.moneriumProfileId,
    rejectedReason: registration.rejectedReason,
    status: registration.status
  };
}

export interface RegistrationDeps {
  /** The profile's state in the partner's white-label app, or null when the app cannot see it. */
  profileState(moneriumProfileId: string): Promise<MoneriumProfileState | null>;
  predictAddress(salt: Hex): Promise<Address>;
  isForwarder(address: Address): Promise<boolean>;
  /** Simulates, then sends `deployForwarder` from the deployer key; a contract revert throws. */
  deploy(destination: Address, recoveryAddress: Address, salt: Hex): Promise<Hex>;
  receiptStatus(hash: Hex, wait: boolean): Promise<"pending" | "reverted" | "success">;
  provision(input: ProvisionMoneriumB2bAccountInput): Promise<{ accountId: string }>;
}

const factoryDeployAbi = parseAbi([
  "function predictAddress(bytes32 salt) view returns (address)",
  "function isForwarder(address forwarder) view returns (bool)",
  "function deployForwarder(address destination, address recoveryAddress, uint32 targetPpm, uint32 floorPpm, bytes32 salt) returns (address)",
  "error NotDeployer()",
  "error CloneFailed()",
  "error ZeroAddress()",
  "error InvalidConfigAddress()",
  "error InvalidFeePolicy()"
]);

const factory = () => config.moneriumB2b.forwarderFactoryAddress as Address;

const defaultDeps: RegistrationDeps = {
  async deploy(destination, recoveryAddress, salt) {
    const deployer = getDeployerWalletClient();
    if (!deployer) throw new Error("MONERIUM_B2B_DEPLOYER_PRIVATE_KEY is not configured");
    const { request } = await getPublicClient().simulateContract({
      abi: factoryDeployAbi,
      account: deployer.account,
      address: factory(),
      args: [destination, recoveryAddress, DEFAULT_TARGET_PPM, DEFAULT_FLOOR_PPM, salt],
      functionName: "deployForwarder"
    });
    return deployer.writeContract({ ...request, chain: null });
  },
  isForwarder: address =>
    getPublicClient().readContract({ abi: factoryDeployAbi, address: factory(), args: [address], functionName: "isForwarder" }),
  predictAddress: salt =>
    getPublicClient().readContract({ abi: factoryDeployAbi, address: factory(), args: [salt], functionName: "predictAddress" }),
  async profileState(moneriumProfileId) {
    try {
      return (await MoneriumApiService.getInstance().getProfile(moneriumProfileId)).state;
    } catch (error) {
      if (error instanceof MoneriumApiError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  },
  provision: provisionMoneriumB2bAccount,
  async receiptStatus(hash, wait) {
    const client = getPublicClient();
    try {
      const receipt = wait
        ? await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS })
        : await client.getTransactionReceipt({ hash });
      return receipt.status;
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError || error instanceof WaitForTransactionReceiptTimeoutError) {
        return "pending";
      }
      throw error;
    }
  }
};

/** The CREATE2 salt: one clone per (profile, destination), so a retry adopts instead of deploying twice. */
export function registrationSalt(moneriumProfileId: string, destination: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "address" }], [moneriumProfileId, destination as Address]));
}

function sameRequest(
  registration: MoneriumAccountRegistration,
  managerProfileId: string,
  input: { destination: string; externalSubjectId: string }
): boolean {
  return (
    registration.managerProfileId === managerProfileId &&
    registration.destination === input.destination &&
    registration.externalSubjectId === input.externalSubjectId
  );
}

function replay(
  registration: MoneriumAccountRegistration,
  managerProfileId: string,
  input: { destination: string; externalSubjectId: string }
): { created: false; registration: RegistrationSnapshot } {
  if (!sameRequest(registration, managerProfileId, input)) {
    throw new MoneriumB2bRegistrationError(
      409,
      "MONERIUM_B2B_DESTINATION_CONFLICT",
      "The Monerium profile is already registered with a different destination or client reference"
    );
  }
  return { created: false, registration: registrationSnapshot(registration) };
}

/**
 * POST /v1/monerium-b2b/accounts. Create-only per Monerium profile: an identical replay
 * returns the current state, anything else is a conflict, never an overwrite.
 */
export async function registerDestination(
  managerProfileId: string,
  body: Record<string, unknown>,
  deps: Pick<RegistrationDeps, "profileState"> = defaultDeps
): Promise<{ created: boolean; registration: RegistrationSnapshot }> {
  const { contactEmail, destination, externalSubjectId, moneriumProfileId } = body;
  if (
    typeof moneriumProfileId !== "string" ||
    !UUID_PATTERN.test(moneriumProfileId) ||
    typeof destination !== "string" ||
    !isAddress(destination) ||
    destination.toLowerCase() === zeroAddress ||
    typeof externalSubjectId !== "string" ||
    externalSubjectId.trim().length === 0 ||
    externalSubjectId.trim().length > 255 ||
    typeof contactEmail !== "string" ||
    Joi.string().email().max(255).validate(contactEmail.trim()).error
  ) {
    throw new MoneriumB2bRegistrationError(
      400,
      "MONERIUM_B2B_INVALID_INPUT",
      "moneriumProfileId must be a UUID, destination a non-zero EVM address (EIP-55 checksum when mixed case), " +
        "externalSubjectId a non-empty string of at most 255 characters, and contactEmail a valid email address"
    );
  }
  const input = {
    contactEmail: contactEmail.trim().toLowerCase(),
    destination: destination.toLowerCase(),
    externalSubjectId: externalSubjectId.trim(),
    moneriumProfileId: moneriumProfileId.toLowerCase()
  };

  const existing = await MoneriumAccountRegistration.findOne({ where: { moneriumProfileId: input.moneriumProfileId } });
  if (existing) return replay(existing, managerProfileId, input);
  if (await MoneriumAccount.findOne({ where: { profileId: input.moneriumProfileId } })) {
    throw new MoneriumB2bRegistrationError(
      409,
      "MONERIUM_B2B_DESTINATION_CONFLICT",
      "The Monerium profile already has an account"
    );
  }

  const state = await deps.profileState(input.moneriumProfileId);
  if (state === null || state === "rejected") {
    throw new MoneriumB2bRegistrationError(
      422,
      "MONERIUM_B2B_PROFILE_UNAVAILABLE",
      state === null ? "The Monerium profile is not visible to the partner's white-label app" : "Monerium rejected the profile"
    );
  }

  try {
    const registration = await MoneriumAccountRegistration.create({ ...input, managerProfileId });
    return { created: true, registration: registrationSnapshot(registration) };
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    const raced = await MoneriumAccountRegistration.findOne({ where: { moneriumProfileId: input.moneriumProfileId } });
    if (!raced) throw error;
    return replay(raced, managerProfileId, input);
  }
}

async function reject(registration: MoneriumAccountRegistration, reason: string): Promise<void> {
  logger.warn(`monerium-b2b: registration for profile ${registration.moneriumProfileId} rejected: ${reason}`);
  await registration.update({ rejectedReason: reason.slice(0, 500), status: MoneriumAccountRegistrationStatus.Rejected });
}

/** A contract revert from the deployment's simulation, by error name; null for anything else. */
function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk(cause => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? "unknown revert") : null;
}

async function advanceRegistration(registration: MoneriumAccountRegistration, deps: RegistrationDeps): Promise<void> {
  const state = await deps.profileState(registration.moneriumProfileId);
  if (state === null) return reject(registration, "the Monerium profile is no longer visible to the partner's white-label app");
  if (state === "rejected") return reject(registration, "Monerium rejected the profile");
  if (state !== "approved") return; // created, incomplete or pending: wait for Monerium

  const salt = registrationSalt(registration.moneriumProfileId, registration.destination);
  const forwarder = await deps.predictAddress(salt);
  if (!(await deps.isForwarder(forwarder))) {
    if (registration.deployTxHash && (await deps.receiptStatus(registration.deployTxHash as Hex, false)) === "pending") {
      return; // the earlier deployment is still in flight
    }
    let hash: Hex;
    try {
      hash = await deps.deploy(
        registration.destination as Address,
        refundAccountFor(registration.moneriumProfileId).address,
        salt
      );
    } catch (error) {
      const name = revertName(error);
      // NotDeployer is Vortex's misconfiguration (setDeployer missing), not the partner's input: retry.
      if (name === null || name === "NotDeployer") throw error;
      return reject(registration, `the forwarder factory refused the deployment (${name})`);
    }
    await registration.update({ deployTxHash: hash });
    if ((await deps.receiptStatus(hash, true)) !== "success") return; // next cycle re-checks the clone
  }

  try {
    const mapped = await deps.provision({
      contactEmail: registration.contactEmail,
      destination: registration.destination,
      externalSubjectId: registration.externalSubjectId,
      forwarderAddress: forwarder,
      managerProfileId: registration.managerProfileId,
      moneriumProfileId: registration.moneriumProfileId
    });
    await registration.update({ accountId: mapped.accountId, status: MoneriumAccountRegistrationStatus.Mapped });
  } catch (error) {
    if (error instanceof MoneriumB2bProvisioningError || error instanceof ManagedProfileProvisioningError) {
      return reject(registration, error.message);
    }
    throw error;
  }
}

/** Activation is an operator call in production; elsewhere a registered account activates once its IBAN is issued. */
async function activateRegisteredAccounts(): Promise<void> {
  const accounts = await MoneriumAccount.findAll({
    where: {
      iban: { [Op.ne]: null },
      id: {
        [Op.in]: sequelize.literal("(SELECT account_id FROM monerium_account_registrations WHERE status = 'mapped')")
      },
      status: MoneriumAccountStatus.Onboarding
    }
  });
  for (const account of accounts) {
    await account.update({ status: MoneriumAccountStatus.Active });
    logger.info(`monerium-b2b: activated registered account ${account.id}`);
  }
}

/** Keeper step: drives every requested registration one step; a failure leaves it for the next cycle. */
export async function advanceRegistrations(deps: RegistrationDeps = defaultDeps): Promise<void> {
  if (!config.moneriumB2b.deployerPrivateKey) return; // registrations are off without the deployer key
  const pending = await MoneriumAccountRegistration.findAll({
    limit: 20,
    order: [["created_at", "ASC"]],
    where: { status: MoneriumAccountRegistrationStatus.Requested }
  });
  for (const registration of pending) {
    try {
      await advanceRegistration(registration, deps);
    } catch (error) {
      logger.error(`monerium-b2b: registration for profile ${registration.moneriumProfileId} failed this cycle:`, error);
    }
  }
  if (config.deploymentEnv !== "production") {
    await activateRegisteredAccounts();
  }
}
