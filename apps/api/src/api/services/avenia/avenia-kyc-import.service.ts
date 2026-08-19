import { createHash } from "node:crypto";
import { BrlaApiError, BrlaApiService, type KycAttempt, KycAttemptResult, KycAttemptStatus } from "@vortexfi/shared";
import httpStatus from "http-status";
import { Op, type Transaction } from "sequelize";
import sequelize from "../../../config/database";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase, { type IndividualKycSubmission } from "../../../models/kycCase.model";
import ManagedProfile from "../../../models/managedProfile.model";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";

const CONSENT_POLICY_VERSION = "sumsub-share-v1";
const SUBMISSION_WINDOW_MS = 15 * 60 * 1000;
const PROVIDER_CLOCK_SKEW_MS = 2 * 60 * 1000;

export interface ResolvedAveniaIndividualKycCase {
  kycCase: KycCase;
  providerCustomer: ProviderCustomer;
}

export interface ImportAveniaKycTokenArgs {
  actorProfileId: string;
  subjectProfileId: string;
  expectedCustomerEntityId?: string;
  idempotencyKey: string;
  importToken: string;
  managedProfileId?: string;
}

export interface ImportedAveniaKycToken {
  attemptId: string;
  status: "pending";
}

export interface ReconciledAveniaIndividualKycStatus {
  kycCase: KycCase;
}

function conflict(message: string): APIError {
  return new APIError({ isPublic: true, message, status: httpStatus.CONFLICT });
}

function managedAccessDenied(): APIError {
  return new APIError({
    isPublic: true,
    message: "The authenticated profile cannot perform this operation for the requested managed profile",
    status: httpStatus.FORBIDDEN
  });
}

async function assertCurrentImportAuthorization(args: ImportAveniaKycTokenArgs, transaction: Transaction): Promise<void> {
  if (!args.managedProfileId && !args.expectedCustomerEntityId) {
    if (args.actorProfileId !== args.subjectProfileId) throw managedAccessDenied();
    return;
  }
  if (!args.managedProfileId || !args.expectedCustomerEntityId) throw managedAccessDenied();

  const manager = await ManagedProfileManager.findByPk(args.actorProfileId, { lock: transaction.LOCK.UPDATE, transaction });
  const relationship = await ManagedProfile.findByPk(args.managedProfileId, { lock: transaction.LOCK.UPDATE, transaction });
  const subject = await User.findByPk(args.subjectProfileId, { lock: transaction.LOCK.UPDATE, transaction });
  const entity = await CustomerEntity.findByPk(args.expectedCustomerEntityId, { lock: transaction.LOCK.UPDATE, transaction });
  if (
    !manager?.isActive ||
    !manager.allowedCorridors.includes("BR") ||
    (manager.allowedCustomerTypes !== null && !manager.allowedCustomerTypes.includes("individual")) ||
    !relationship ||
    relationship.managerProfileId !== args.actorProfileId ||
    relationship.profileId !== args.subjectProfileId ||
    relationship.status !== "active" ||
    subject?.kind !== "managed" ||
    subject.activeCustomerEntityId !== args.expectedCustomerEntityId ||
    !entity ||
    entity.profileId !== args.subjectProfileId ||
    entity.status !== "active" ||
    entity.type !== "individual"
  ) {
    throw managedAccessDenied();
  }
}

async function resolveEligibleCase(
  subjectProfileId: string,
  expectedCustomerEntityId?: string,
  transaction?: Transaction,
  allowApproved = false
): Promise<ResolvedAveniaIndividualKycCase> {
  const profile = await User.findByPk(subjectProfileId, { transaction });
  if (!profile?.activeCustomerEntityId) throw conflict("The subject profile has no active customer entity");
  if (expectedCustomerEntityId) {
    if (profile.kind !== "managed" || profile.activeCustomerEntityId !== expectedCustomerEntityId) {
      throw conflict("The managed subject does not match the expected customer entity");
    }
  } else if (profile.kind !== "authenticated") {
    throw conflict("A managed profile requires a managed customer entity context");
  }

  const entity = await CustomerEntity.findOne({
    transaction,
    where: { id: profile.activeCustomerEntityId, profileId: subjectProfileId }
  });
  if (!entity || entity.status !== "active") throw conflict("The subject customer entity is not active");
  if (entity.type !== "individual") throw conflict("Token import is only available for individuals");

  const providerCustomers = await ProviderCustomer.findAll({
    transaction,
    where: { country: "BR", customerEntityId: entity.id, customerType: "individual", provider: "avenia", rail: "brl" }
  });
  if (providerCustomers.length !== 1) {
    throw conflict(
      providerCustomers.length === 0
        ? "Exactly one active Brazilian individual customer is required"
        : "Multiple customers require reconciliation"
    );
  }
  const providerCustomer = providerCustomers[0];
  if (!providerCustomer.providerSubaccountId) throw conflict("The BR subaccount is not provisioned");
  if (!allowApproved && providerCustomer.status === VerificationStatus.Approved) {
    throw conflict("The customer is already approved");
  }

  const cases = await KycCase.findAll({
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    transaction,
    where: { customerEntityId: entity.id, provider: "avenia", providerCustomerId: providerCustomer.id, type: "kyc" }
  });
  if (cases.length !== 1) {
    throw conflict(cases.length === 0 ? "The canonical KYC case is missing" : "Multiple KYC cases require reconciliation");
  }
  if (!allowApproved && cases[0].status === VerificationStatus.Approved) {
    throw conflict("The KYC case is already approved");
  }
  return { kycCase: cases[0], providerCustomer };
}

export async function resolveEligibleAveniaIndividualKycCase(
  subjectProfileId: string,
  expectedCustomerEntityId?: string
): Promise<ResolvedAveniaIndividualKycCase> {
  return resolveEligibleCase(subjectProfileId, expectedCustomerEntityId);
}

export async function reconcileAveniaIndividualKycStatusMethod(
  providerCustomerId: string,
  _brlaApiService?: BrlaApiService
): Promise<ReconciledAveniaIndividualKycStatus> {
  return sequelize.transaction(async transaction => {
    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { provider: "avenia", providerCustomerId, type: "kyc" }
    });
    if (cases.length !== 1) throw conflict("Exactly one canonical KYC case is required");
    if (!cases[0].verificationMethod) await cases[0].update({ verificationMethod: "standard" }, { transaction });
    return { kycCase: cases[0] };
  });
}

export async function claimStandardAveniaKycMethod(providerCustomer: ProviderCustomer): Promise<KycCase> {
  if (providerCustomer.provider !== "avenia" || providerCustomer.customerType !== "individual") {
    throw conflict("Standard individual KYC requires an individual customer account");
  }
  return sequelize.transaction(async transaction => {
    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { provider: "avenia", providerCustomerId: providerCustomer.id, type: "kyc" }
    });
    if (cases.length !== 1) throw conflict("Exactly one canonical KYC case is required");
    const kycCase = cases[0];
    const lockedCustomer = await ProviderCustomer.findByPk(providerCustomer.id, { transaction });
    if (!lockedCustomer || lockedCustomer.provider !== "avenia" || lockedCustomer.customerType !== "individual") {
      throw conflict("Standard individual KYC requires an individual customer account");
    }
    if (lockedCustomer.status === VerificationStatus.Approved || kycCase.status === VerificationStatus.Approved) {
      throw conflict("The KYC case is already approved");
    }
    if (kycCase.verificationMethod === "sumsub_share_token") throw conflict("This KYC case uses Sumsub token import");
    if (!kycCase.verificationMethod) await kycCase.update({ verificationMethod: "standard" }, { transaction });
    return kycCase;
  });
}

function submissionResult(kycCase: KycCase): ImportedAveniaKycToken {
  if (!kycCase.providerCaseId) throw conflict("The confirmed token import is missing its provider attempt");
  return { attemptId: kycCase.providerCaseId, status: "pending" };
}

interface PreparedClaim {
  kycCaseId: string;
  providerCustomer: ProviderCustomer;
  replay?: ImportedAveniaKycToken;
  reconcile?: boolean;
}

function sameTokenClaim(
  submission: IndividualKycSubmission,
  args: ImportAveniaKycTokenArgs,
  keyHash: string,
  tokenHash: string
) {
  return (
    submission.actorProfileId === args.actorProfileId &&
    submission.subjectProfileId === args.subjectProfileId &&
    submission.idempotencyKeyHash === keyHash &&
    submission.tokenFingerprint === tokenHash
  );
}

async function prepareImportClaim(
  args: ImportAveniaKycTokenArgs,
  idempotencyKeyHash: string,
  tokenFingerprint: string
): Promise<PreparedClaim> {
  return sequelize.transaction(async transaction => {
    const { kycCase, providerCustomer } = await resolveEligibleCase(
      args.subjectProfileId,
      args.expectedCustomerEntityId,
      transaction,
      true
    );
    await assertCurrentImportAuthorization(args, transaction);
    const existing = kycCase.verificationSubmission;
    if (existing?.idempotencyKeyHash === idempotencyKeyHash) {
      if (existing.tokenFingerprint !== tokenFingerprint) throw conflict("The idempotency key was used with a different token");
      if (!sameTokenClaim(existing, args, idempotencyKeyHash, tokenFingerprint)) {
        throw conflict("The token import does not match this request");
      }
      if (existing.status === "confirmed")
        return { kycCaseId: kycCase.id, providerCustomer, replay: submissionResult(kycCase) };
      if (existing.status === "failed") throw conflict("A failed token import requires a new idempotency key");
      if (existing.status === "submitted" || existing.status === "ambiguous") {
        return { kycCaseId: kycCase.id, providerCustomer, reconcile: true };
      }
      return { kycCaseId: kycCase.id, providerCustomer };
    }
    if (providerCustomer.status === VerificationStatus.Approved || kycCase.status === VerificationStatus.Approved) {
      throw conflict("The KYC is already approved");
    }
    if (existing && existing.status !== "failed") throw conflict("Another token import requires reconciliation");
    if (kycCase.verificationMethod === "standard") throw conflict("This KYC case uses the standard verification method");
    if (!kycCase.verificationMethod) await kycCase.update({ verificationMethod: "sumsub_share_token" }, { transaction });
    const consentAttestation = {
      actorProfileId: args.actorProfileId,
      attestedAt: new Date().toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
      subjectProfileId: args.subjectProfileId
    };
    await kycCase.update(
      {
        verificationSubmission: {
          actorProfileId: args.actorProfileId,
          attemptBaselineIds: [],
          consentAttestations: [...(existing?.consentAttestations ?? []), consentAttestation],
          idempotencyKeyHash,
          status: "prepared",
          subjectProfileId: args.subjectProfileId,
          tokenFingerprint
        }
      },
      { transaction }
    );
    return { kycCaseId: kycCase.id, providerCustomer };
  });
}

async function updateSubmittedClaim(
  kycCaseId: string,
  values: Partial<IndividualKycSubmission>,
  statuses: IndividualKycSubmission["status"][] = ["submitted"]
): Promise<void> {
  await sequelize.transaction(async transaction => {
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!kycCase?.verificationSubmission || !statuses.includes(kycCase.verificationSubmission.status)) return;
    await kycCase.update({ verificationSubmission: { ...kycCase.verificationSubmission, ...values } }, { transaction });
  });
}

async function submitPreparedClaim(
  claim: PreparedClaim,
  args: ImportAveniaKycTokenArgs,
  idempotencyKeyHash: string,
  tokenFingerprint: string,
  attemptBaselineIds: string[]
): Promise<ImportedAveniaKycToken | string> {
  const result = await sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(claim.providerCustomer.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(claim.kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    try {
      await assertCurrentImportAuthorization(args, transaction);
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== httpStatus.FORBIDDEN) throw error;
      if (
        kycCase?.verificationSubmission &&
        sameTokenClaim(kycCase.verificationSubmission, args, idempotencyKeyHash, tokenFingerprint)
      ) {
        await kycCase.update(
          {
            verificationSubmission: {
              ...kycCase.verificationSubmission,
              errorClassification: "authorization_revoked",
              status: "failed"
            }
          },
          { transaction }
        );
      }
      return error;
    }
    const submission = kycCase?.verificationSubmission;
    if (
      !providerCustomer ||
      !kycCase ||
      !submission ||
      kycCase.providerCustomerId !== providerCustomer.id ||
      kycCase.verificationMethod !== "sumsub_share_token"
    ) {
      throw conflict("The token import binding is no longer current");
    }
    if (submission.status === "confirmed") return submissionResult(kycCase);
    if (providerCustomer.status === VerificationStatus.Approved || kycCase.status === VerificationStatus.Approved) {
      throw conflict("The KYC is already approved");
    }
    if (submission.status !== "prepared" || !sameTokenClaim(submission, args, idempotencyKeyHash, tokenFingerprint)) {
      throw conflict("The token import was already claimed");
    }
    if (!providerCustomer.providerSubaccountId) throw conflict("The BR subaccount is not provisioned");
    await kycCase.update(
      {
        submittedAt: new Date(),
        verificationSubmission: { ...submission, attemptBaselineIds, status: "submitted" }
      },
      { transaction }
    );
    return providerCustomer.providerSubaccountId;
  });
  if (result instanceof APIError) throw result;
  return result;
}

async function confirmSubmission(
  kycCaseId: string,
  providerCustomerId: string,
  attemptId: string
): Promise<ImportedAveniaKycToken> {
  if (!attemptId) throw conflict("The token import attempt is invalid");
  await sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(providerCustomerId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    const submission = kycCase?.verificationSubmission;
    if (!kycCase || !providerCustomer || !submission) throw new Error("Token import binding state disappeared");
    if (submission.status === "confirmed") {
      if (kycCase.providerCaseId !== attemptId) throw conflict("The token import attempt requires reconciliation");
      return;
    }
    if (submission.status !== "submitted" && submission.status !== "ambiguous") {
      throw new Error("Token import submission cannot be confirmed");
    }
    if (kycCase.providerCaseId && kycCase.providerCaseId !== attemptId) {
      throw conflict("The token import attempt requires reconciliation");
    }
    await kycCase.update(
      {
        providerCaseId: attemptId,
        ...(kycCase.status === VerificationStatus.Approved
          ? {}
          : { status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING }),
        verificationSubmission: { ...submission, errorClassification: undefined, status: "confirmed" }
      },
      { transaction }
    );
    if (providerCustomer.status !== VerificationStatus.Approved) {
      await providerCustomer.update(
        { lastFailureReasons: [], status: VerificationStatus.Pending, statusExternal: KycAttemptStatus.PENDING },
        { transaction }
      );
    }
  });
  return { attemptId, status: "pending" };
}

async function reconcileSubmission(claim: PreparedClaim, brlaApiService: BrlaApiService): Promise<ImportedAveniaKycToken> {
  const kycCase = await KycCase.findByPk(claim.kycCaseId);
  const submission = kycCase?.verificationSubmission;
  if (!kycCase || !submission || !kycCase.submittedAt) {
    throw conflict("The previous token import outcome requires reconciliation");
  }
  if (kycCase.providerCaseId) return confirmSubmission(kycCase.id, claim.providerCustomer.id, kycCase.providerCaseId);
  let attempts: KycAttempt[];
  try {
    ({ attempts } = await brlaApiService.getKycAttempts(claim.providerCustomer.providerSubaccountId as string));
  } catch {
    throw conflict("The previous token import outcome requires reconciliation");
  }
  const submittedAt = kycCase.submittedAt.getTime();
  const eligible = attempts.filter(attempt => {
    const createdAt = Date.parse(attempt.createdAt);
    return (
      Boolean(attempt.id) &&
      attempt.levelName.startsWith("sumsub-token-") &&
      Number.isFinite(createdAt) &&
      createdAt >= submittedAt - PROVIDER_CLOCK_SKEW_MS &&
      createdAt <= submittedAt + SUBMISSION_WINDOW_MS + PROVIDER_CLOCK_SKEW_MS
    );
  });
  const bound = eligible.length
    ? await KycCase.findAll({
        attributes: ["providerCaseId"],
        where: { id: { [Op.ne]: kycCase.id }, providerCaseId: { [Op.in]: eligible.map(attempt => attempt.id) } }
      })
    : [];
  const excluded = new Set([...submission.attemptBaselineIds, ...bound.map(row => row.providerCaseId)]);
  const candidates = eligible.filter(attempt => !excluded.has(attempt.id));
  if (candidates.length !== 1) throw conflict("The previous token import outcome requires reconciliation");
  return confirmSubmission(kycCase.id, claim.providerCustomer.id, candidates[0].id);
}

function isFeatureUnavailable(error: unknown): boolean {
  return (
    (error instanceof BrlaApiError && error.status === 401) ||
    (error instanceof Error && error.message === "Authorization error.")
  );
}

export async function importBrKycToken(args: ImportAveniaKycTokenArgs): Promise<ImportedAveniaKycToken> {
  const tokenFingerprint = createHash("sha256").update(args.importToken, "utf8").digest("hex");
  const idempotencyKeyHash = createHash("sha256").update(args.idempotencyKey, "utf8").digest("hex");
  const claim = await prepareImportClaim(args, idempotencyKeyHash, tokenFingerprint);
  if (claim.replay) return claim.replay;
  const brlaApiService = BrlaApiService.getInstance();
  if (claim.reconcile) return reconcileSubmission(claim, brlaApiService);

  let attemptBaselineIds: string[];
  try {
    const { attempts } = await brlaApiService.getKycAttempts(claim.providerCustomer.providerSubaccountId as string);
    attemptBaselineIds = [...new Set(attempts.map(attempt => attempt.id))];
  } catch {
    await updateSubmittedClaim(claim.kycCaseId, { errorClassification: "pre_provider_check_failed", status: "failed" }, [
      "prepared"
    ]);
    throw new APIError({
      isPublic: true,
      message: "Token import pre-provider checks failed",
      status: httpStatus.BAD_GATEWAY
    });
  }

  const submitted = await submitPreparedClaim(claim, args, idempotencyKeyHash, tokenFingerprint, attemptBaselineIds);
  if (typeof submitted !== "string") return submitted;
  let attemptId: string;
  try {
    attemptId = (await brlaApiService.importKycToken(args.importToken, submitted)).id;
  } catch (error) {
    if (isFeatureUnavailable(error)) {
      await updateSubmittedClaim(claim.kycCaseId, { errorClassification: "feature_unavailable", status: "failed" });
      throw new APIError({
        isPublic: true,
        message: "Token import is not enabled",
        status: httpStatus.PRECONDITION_FAILED
      });
    }
    await updateSubmittedClaim(claim.kycCaseId, { errorClassification: "provider_outcome_unknown", status: "ambiguous" });
    throw new APIError({
      isPublic: true,
      message: "The token import outcome requires reconciliation",
      status: httpStatus.BAD_GATEWAY
    });
  }
  try {
    return await confirmSubmission(claim.kycCaseId, claim.providerCustomer.id, attemptId);
  } catch {
    await sequelize
      .transaction(async transaction => {
        const kycCase = await KycCase.findByPk(claim.kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
        if (!kycCase?.verificationSubmission) return;
        await kycCase.update(
          {
            providerCaseId: attemptId,
            verificationSubmission: {
              ...kycCase.verificationSubmission,
              errorClassification: "local_confirmation_failed",
              status: "ambiguous"
            }
          },
          { transaction }
        );
      })
      .catch(() => undefined);
    throw new APIError({
      isPublic: true,
      message: "The token import outcome requires reconciliation",
      status: httpStatus.BAD_GATEWAY
    });
  }
}

export function mapAveniaKycAttemptStatus(
  attempt: Pick<KycAttempt, "result" | "status">
): VerificationStatus.Pending | VerificationStatus.InReview | VerificationStatus.Approved | VerificationStatus.Rejected {
  if (attempt.status === KycAttemptStatus.PENDING) return VerificationStatus.Pending;
  if (attempt.status === KycAttemptStatus.PROCESSING) return VerificationStatus.InReview;
  if (attempt.status === KycAttemptStatus.EXPIRED) return VerificationStatus.Pending;
  if (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.APPROVED)
    return VerificationStatus.Approved;
  if (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED)
    return VerificationStatus.Rejected;
  throw new APIError({ message: "The provider returned an invalid KYC attempt state", status: httpStatus.BAD_GATEWAY });
}
