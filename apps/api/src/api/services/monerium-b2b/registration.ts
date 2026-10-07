import { MoneriumApiError, MoneriumApiService, type MoneriumProfileState } from "@vortexfi/shared";
import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  type Hex,
  InsufficientFundsError,
  isAddress,
  keccak256,
  parseAbi,
  TransactionReceiptNotFoundError,
  zeroAddress
} from "viem";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import CustomerEntity from "../../../models/customerEntity.model";
import ManagedProfile from "../../../models/managedProfile.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumAccountRegistration, {
  MoneriumAccountRegistrationStatus,
  type MoneriumRegistrationWaitingReason
} from "../../../models/moneriumAccountRegistration.model";
import User from "../../../models/user.model";
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
import { refundAccountFor } from "./refund-wallet";

/**
 * Partner-registered destinations (docs/adr-0007-monerium-b2b-partner-registration.md):
 * the partner names a Monerium profile in its white-label app and the client's
 * destination; once Monerium approves the profile, the keeper deploys the client's
 * forwarder with the factory deployer key and maps the account through the same
 * verified path as the admin call. The destination is create-only.
 *
 * A registration is rejected only for a definite reason: Monerium rejected or closed the
 * profile, the factory refused the deployment's arguments, or the client data conflicts
 * with an existing client. Everything else (an RPC or Monerium hiccup, a missing deployer
 * role, an unfunded deployer) leaves it waiting with a reason the partner can read, and
 * the partner may register a rejected profile again.
 */

export class MoneriumB2bRegistrationError extends Error {
  constructor(
    readonly status: 400 | 409 | 422 | 503,
    readonly code:
      | "MONERIUM_B2B_INVALID_INPUT"
      | "MONERIUM_B2B_DESTINATION_CONFLICT"
      | "MONERIUM_B2B_CLIENT_CONFLICT"
      | "MONERIUM_B2B_PROFILE_UNAVAILABLE"
      | "MONERIUM_B2B_PROVIDER_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * `status` is `requested` until the account is mapped (`accountId` set) or the registration is
 * rejected; while it is requested, `waitingReason` says what it waits for.
 */
export function registrationSnapshot(registration: MoneriumAccountRegistration) {
  return {
    accountId: registration.accountId,
    createdAt: registration.createdAt.toISOString(),
    destination: registration.destination,
    externalSubjectId: registration.externalSubjectId,
    moneriumProfileId: registration.moneriumProfileId,
    rejectedReason: registration.rejectedReason,
    status: registration.status,
    waitingReason: registration.status === MoneriumAccountRegistrationStatus.Requested ? registration.waitingReason : null
  };
}

export interface RegistrationDeps {
  /**
   * The profile's state in the partner's white-label app, or null when Monerium does not know it
   * there (404). A 403 throws: it can also be a privilege Vortex's app lacks, so it is never
   * blamed on the partner's input.
   */
  profileState(moneriumProfileId: string): Promise<MoneriumProfileState | null>;
  /** The clone's CREATE2 address, bound to its destination, recovery address, launch fee policy and salt. */
  predictAddress(destination: Address, recoveryAddress: Address, salt: Hex): Promise<Address>;
  isForwarder(address: Address): Promise<boolean>;
  /** Simulates, then sends `deployForwarder` from the deployer key; a contract revert throws. */
  deploy(destination: Address, recoveryAddress: Address, salt: Hex): Promise<Hex>;
  receiptStatus(hash: Hex): Promise<"pending" | "reverted" | "success">;
  provision(input: ProvisionMoneriumB2bAccountInput): Promise<{ accountId: string }>;
}

const factoryDeployAbi = parseAbi([
  "function predictAddress(address destination, address recoveryAddress, uint32 targetPpm, uint32 floorPpm, bytes32 salt) view returns (address)",
  "function isForwarder(address forwarder) view returns (bool)",
  "function deployForwarder(address destination, address recoveryAddress, uint32 targetPpm, uint32 floorPpm, bytes32 salt) returns (address)",
  "error NotDeployer()",
  "error CloneFailed()",
  "error InvalidConfigAddress()",
  "error ZeroAddress()",
  "error InvalidFeePolicy()",
  "error AlreadyInitialized()",
  "error NotFactory()"
]);

/** Factory refusals caused by the registration's own arguments: retrying cannot help. */
const TERMINAL_DEPLOY_ERRORS = new Set(["InvalidConfigAddress", "ZeroAddress", "InvalidFeePolicy"]);

/** A deployment without a receipt after this long counts as dropped and is sent again. */
export const DEPLOYMENT_RESEND_AFTER_MS = 10 * 60 * 1000;

/** Registrations evaluated per keeper cycle, least recently checked first. */
const REGISTRATIONS_PER_CYCLE = 20;

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
  predictAddress: (destination, recoveryAddress, salt) =>
    getPublicClient().readContract({
      abi: factoryDeployAbi,
      address: factory(),
      args: [destination, recoveryAddress, DEFAULT_TARGET_PPM, DEFAULT_FLOOR_PPM, salt],
      functionName: "predictAddress"
    }),
  async profileState(moneriumProfileId) {
    try {
      return (await MoneriumApiService.getInstance().getProfile(moneriumProfileId)).state;
    } catch (error) {
      if (error instanceof MoneriumApiError && error.status === 404) return null;
      throw error;
    }
  },
  provision: provisionMoneriumB2bAccount,
  async receiptStatus(hash) {
    try {
      return (await getPublicClient().getTransactionReceipt({ hash })).status;
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) return "pending";
      throw error;
    }
  }
};

export type RegistrationSnapshot = ReturnType<typeof registrationSnapshot>;

/** The caller's CREATE2 salt: one clone per (profile, destination), so a retry adopts instead of deploying twice. */
export function registrationSalt(moneriumProfileId: string, destination: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "address" }], [moneriumProfileId, destination as Address]));
}

interface RegistrationInput {
  contactEmail: string;
  destination: string;
  externalSubjectId: string;
  moneriumProfileId: string;
}

/**
 * The conflicts the mapping step would hit (managed-profile-provisioning.service.ts and
 * account-provisioning.ts), checked before a registration is accepted and again before the
 * keeper pays for a deployment. Null when there is none.
 */
export async function clientConflict(managerProfileId: string, input: RegistrationInput): Promise<string | null> {
  const child = await ManagedProfile.findOne({ where: { externalSubjectId: input.externalSubjectId, managerProfileId } });
  if (child) {
    if (child.status !== "active" || child.contactEmail !== input.contactEmail) {
      return "The client reference already belongs to a client with a different contact email";
    }
    const profile = await User.findByPk(child.profileId);
    const entity = profile?.activeCustomerEntityId
      ? await CustomerEntity.findOne({ where: { id: profile.activeCustomerEntityId, profileId: child.profileId } })
      : null;
    if (!entity || entity.type !== "business") {
      return "The client reference already belongs to a client that is not a business";
    }
    const account = await MoneriumAccount.findOne({ where: { vortexProfileId: child.profileId } });
    if (account && account.profileId !== input.moneriumProfileId) {
      return "The client reference already belongs to a client with another Monerium profile";
    }
  } else if (await ManagedProfile.findOne({ where: { contactEmail: input.contactEmail, managerProfileId } })) {
    return "The contact email already belongs to another client";
  }
  const other = await MoneriumAccountRegistration.findOne({
    where: {
      [Op.or]: [{ externalSubjectId: input.externalSubjectId }, { contactEmail: input.contactEmail }],
      managerProfileId,
      moneriumProfileId: { [Op.ne]: input.moneriumProfileId },
      status: { [Op.ne]: MoneriumAccountRegistrationStatus.Rejected }
    }
  });
  if (other) {
    return other.externalSubjectId === input.externalSubjectId
      ? "The client reference is already registered for another Monerium profile"
      : "The contact email is already registered for another Monerium profile";
  }
  return null;
}

function replay(
  registration: MoneriumAccountRegistration,
  managerProfileId: string,
  input: RegistrationInput
): { created: false; registration: RegistrationSnapshot } {
  if (
    registration.managerProfileId !== managerProfileId ||
    registration.destination !== input.destination ||
    registration.externalSubjectId !== input.externalSubjectId ||
    registration.contactEmail !== input.contactEmail
  ) {
    throw new MoneriumB2bRegistrationError(
      409,
      "MONERIUM_B2B_DESTINATION_CONFLICT",
      "The Monerium profile is already registered with a different destination, client reference or contact email"
    );
  }
  return { created: false, registration: registrationSnapshot(registration) };
}

/** The profile's state at request time; Monerium being unreachable is a 503, never a 500 or a 422. */
async function requestTimeProfileState(moneriumProfileId: string): Promise<MoneriumProfileState | null> {
  try {
    return await defaultDeps.profileState(moneriumProfileId);
  } catch (error) {
    logger.error(`monerium-b2b: profile ${moneriumProfileId} could not be read at registration:`, error);
    throw new MoneriumB2bRegistrationError(
      503,
      "MONERIUM_B2B_PROVIDER_UNAVAILABLE",
      "Monerium did not answer the profile check; retry the identical request later"
    );
  }
}

/**
 * POST /v1/monerium-b2b/accounts. Create-only per Monerium profile: an identical replay
 * returns the current state, anything else is a conflict, never an overwrite. A rejected
 * registration may be registered again, with the same or corrected data.
 */
export async function registerDestination(
  managerProfileId: string,
  body: Record<string, unknown>
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
  const input: RegistrationInput = {
    contactEmail: contactEmail.trim().toLowerCase(),
    destination: destination.toLowerCase(),
    externalSubjectId: externalSubjectId.trim(),
    moneriumProfileId: moneriumProfileId.toLowerCase()
  };

  const existing = await MoneriumAccountRegistration.findOne({ where: { moneriumProfileId: input.moneriumProfileId } });
  const retry =
    existing?.status === MoneriumAccountRegistrationStatus.Rejected && existing.managerProfileId === managerProfileId;
  if (existing && !retry) return replay(existing, managerProfileId, input);
  if (await MoneriumAccount.findOne({ where: { profileId: input.moneriumProfileId } })) {
    throw new MoneriumB2bRegistrationError(
      409,
      "MONERIUM_B2B_DESTINATION_CONFLICT",
      "The Monerium profile already has an account"
    );
  }
  const conflict = await clientConflict(managerProfileId, input);
  if (conflict) throw new MoneriumB2bRegistrationError(409, "MONERIUM_B2B_CLIENT_CONFLICT", conflict);

  const state = await requestTimeProfileState(input.moneriumProfileId);
  if (state === null || state === "rejected" || state === "closed") {
    throw new MoneriumB2bRegistrationError(
      422,
      "MONERIUM_B2B_PROFILE_UNAVAILABLE",
      state === null
        ? "The Monerium profile is not visible to the white-label app Vortex operates for you: check the profile ID"
        : `Monerium ${state === "closed" ? "closed" : "rejected"} the profile`
    );
  }

  if (existing && retry) {
    await existing.update({
      ...input,
      deploySentAt: null,
      deployTxHash: null,
      lastCheckedAt: null,
      rejectedReason: null,
      status: MoneriumAccountRegistrationStatus.Requested,
      waitingReason: null
    });
    logger.info(`monerium-b2b: profile ${input.moneriumProfileId} registered again after a rejection`);
    return { created: true, registration: registrationSnapshot(existing) };
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

/**
 * Operator withdrawal of a registration not mapped yet (a partner typo, a wrong destination,
 * a revoked clone): it becomes rejected, and the partner registers the profile again with
 * corrected data. A clone already deployed for it stays unused (no IBAN is linked to it).
 * False when it is not requested.
 */
export async function withdrawRegistration(registrationId: string): Promise<boolean> {
  const [count] = await MoneriumAccountRegistration.update(
    {
      rejectedReason: "Withdrawn by Vortex operations: register the profile again with corrected data",
      status: MoneriumAccountRegistrationStatus.Rejected,
      waitingReason: null
    },
    { where: { id: registrationId, status: MoneriumAccountRegistrationStatus.Requested } }
  );
  if (count > 0) logger.info(`monerium-b2b: operator withdrew registration ${registrationId}`);
  return count > 0;
}

/** The stored reason is always Vortex's own text; error details go to the log only. */
async function reject(registration: MoneriumAccountRegistration, reason: string): Promise<null> {
  logger.warn(`monerium-b2b: registration for profile ${registration.moneriumProfileId} rejected: ${reason}`);
  await registration.update({
    rejectedReason: reason.slice(0, 500),
    status: MoneriumAccountRegistrationStatus.Rejected,
    waitingReason: null
  });
  return null;
}

/** A contract revert from the deployment's simulation, by decoded error name; null when nothing decoded. */
function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk(cause => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? null) : null;
}

function isInsufficientFunds(error: unknown): boolean {
  return (
    error instanceof BaseError && error.walk(cause => cause instanceof InsufficientFundsError) instanceof InsufficientFundsError
  );
}

interface CycleState {
  /** One deployment per cycle: back-to-back sends from one key could reuse a nonce. */
  deploymentSent: boolean;
}

/**
 * Drives one registration a step. Returns what it now waits for, or null once it is mapped or
 * rejected. A thrown error is transient: the caller records it and retries next cycle.
 */
async function advanceRegistration(
  registration: MoneriumAccountRegistration,
  deps: RegistrationDeps,
  cycle: CycleState
): Promise<MoneriumRegistrationWaitingReason | null> {
  // An operator may have mapped the profile through the admin path in the meantime.
  const mappedByOperator = await MoneriumAccount.findOne({ where: { profileId: registration.moneriumProfileId } });
  if (mappedByOperator) {
    if (mappedByOperator.destination.toLowerCase() !== registration.destination) {
      return reject(registration, "An operator mapped this Monerium profile to a different destination");
    }
    await registration.update({
      accountId: mappedByOperator.id,
      status: MoneriumAccountRegistrationStatus.Mapped,
      waitingReason: null
    });
    logger.info(`monerium-b2b: registration for profile ${registration.moneriumProfileId} adopted the operator's account`);
    return null;
  }

  const state = await deps.profileState(registration.moneriumProfileId);
  if (state === null) return "monerium_profile_not_visible";
  if (state === "rejected") return reject(registration, "Monerium rejected the profile");
  if (state === "closed") return reject(registration, "Monerium closed the profile");
  if (state !== "approved") return "monerium_profile_pending"; // created, incomplete, pending, review

  const conflict = await clientConflict(registration.managerProfileId, registration);
  if (conflict) return reject(registration, conflict);

  const destination = registration.destination as Address;
  const recoveryAddress = refundAccountFor(registration.moneriumProfileId).address;
  const salt = registrationSalt(registration.moneriumProfileId, registration.destination);
  const forwarder = await deps.predictAddress(destination, recoveryAddress, salt);
  if (!(await deps.isForwarder(forwarder))) {
    if (registration.deployTxHash && (await deps.receiptStatus(registration.deployTxHash as Hex)) === "pending") {
      const sentAt = registration.deploySentAt?.getTime() ?? 0;
      if (Date.now() - sentAt < DEPLOYMENT_RESEND_AFTER_MS) return "deployment_pending";
      logger.warn(
        `monerium-b2b: deployment ${registration.deployTxHash} for profile ${registration.moneriumProfileId} ` +
          "has no receipt after 10 minutes; sending it again"
      );
    }
    if (cycle.deploymentSent) return "deployment_pending";
    let hash: Hex;
    try {
      hash = await deps.deploy(destination, recoveryAddress, salt);
    } catch (error) {
      const name = revertName(error);
      if (name && TERMINAL_DEPLOY_ERRORS.has(name)) {
        logger.warn(`monerium-b2b: factory refused the deployment for profile ${registration.moneriumProfileId}:`, error);
        return reject(registration, `The forwarder factory refused the deployment (${name})`);
      }
      // A clone already sits at the address (a stale registry read): adopt it next cycle.
      if (name === "CloneFailed") return "deployment_pending";
      // Vortex's side (setDeployer missing, deployer out of gas), not the partner's input.
      if (name === "NotDeployer" || isInsufficientFunds(error)) {
        logger.error(
          `monerium-b2b: the deployer cannot deploy for profile ${registration.moneriumProfileId} ` +
            `(${name === "NotDeployer" ? "no deployer role on the factory" : "insufficient funds"})`
        );
        return "deployer_not_ready";
      }
      throw error;
    }
    cycle.deploymentSent = true;
    await registration.update({ deploySentAt: new Date(), deployTxHash: hash });
    logger.info(`monerium-b2b: forwarder ${forwarder} for profile ${registration.moneriumProfileId} deployment sent (${hash})`);
    return "deployment_pending";
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
    await registration.update({
      accountId: mapped.accountId,
      status: MoneriumAccountRegistrationStatus.Mapped,
      waitingReason: null
    });
    logger.info(
      `monerium-b2b: registration for profile ${registration.moneriumProfileId} mapped to account ${mapped.accountId}`
    );
    return null;
  } catch (error) {
    if (error instanceof MoneriumB2bProvisioningError && error.retryable) {
      logger.warn(`monerium-b2b: mapping for profile ${registration.moneriumProfileId} retries next cycle:`, error);
      return "temporary_error";
    }
    if (
      error instanceof ManagedProfileProvisioningError &&
      (error.code === "MANAGED_PROFILE_MANAGER_INACTIVE" || error.code === "MANAGED_PROFILE_MANAGER_NOT_FOUND")
    ) {
      logger.error(`monerium-b2b: mapping for profile ${registration.moneriumProfileId} waits: ${error.message}`);
      return "manager_inactive";
    }
    if (error instanceof MoneriumB2bProvisioningError || error instanceof ManagedProfileProvisioningError) {
      return reject(registration, error.message);
    }
    throw error;
  }
}

/** Records a waiting registration's reason and check time; logs only when the reason changes. */
async function recordWaiting(
  registration: MoneriumAccountRegistration,
  reason: MoneriumRegistrationWaitingReason,
  checkedAt: Date
): Promise<void> {
  if (registration.waitingReason !== reason) {
    logger.info(`monerium-b2b: registration for profile ${registration.moneriumProfileId} waits: ${reason}`);
  }
  await registration.update({ lastCheckedAt: checkedAt, waitingReason: reason });
}

/**
 * Activation is an operator call; only the sandbox activates a registered account once its IBAN
 * is issued (ADR-0007 decision 6).
 */
async function activateRegisteredAccounts(): Promise<void> {
  const [count] = await MoneriumAccount.update(
    { activatedAt: new Date(), status: MoneriumAccountStatus.Active },
    {
      where: {
        iban: { [Op.ne]: null },
        id: { [Op.in]: sequelize.literal("(SELECT account_id FROM monerium_account_registrations WHERE status = 'mapped')") },
        status: MoneriumAccountStatus.Onboarding
      }
    }
  );
  if (count > 0) logger.info(`monerium-b2b: activated ${count} registered account(s) in the sandbox`);
}

/**
 * Keeper step: drives the least recently checked requested registrations one step each, so
 * registrations waiting for Monerium never crowd out newer ones; a failure leaves a
 * registration for the next cycle.
 */
export async function advanceRegistrations(deps: RegistrationDeps = defaultDeps): Promise<void> {
  if (!config.moneriumB2b.deployerPrivateKey) return; // registrations are off without the deployer key
  const pending = await MoneriumAccountRegistration.findAll({
    limit: REGISTRATIONS_PER_CYCLE,
    order: [
      ["lastCheckedAt", "ASC NULLS FIRST"],
      ["createdAt", "ASC"]
    ],
    where: { status: MoneriumAccountRegistrationStatus.Requested }
  });
  const cycle: CycleState = { deploymentSent: false };
  for (const registration of pending) {
    const checkedAt = new Date();
    try {
      const waiting = await advanceRegistration(registration, deps, cycle);
      if (waiting) await recordWaiting(registration, waiting, checkedAt);
    } catch (error) {
      logger.error(`monerium-b2b: registration for profile ${registration.moneriumProfileId} failed this cycle:`, error);
      try {
        await recordWaiting(registration, "temporary_error", checkedAt);
      } catch (recordError) {
        logger.error(
          `monerium-b2b: could not record the waiting state of profile ${registration.moneriumProfileId}:`,
          recordError
        );
      }
    }
  }
  if (config.sandboxEnabled) {
    await activateRegisteredAccounts();
  }
}
