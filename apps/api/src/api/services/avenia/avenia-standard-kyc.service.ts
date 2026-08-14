import { createHash } from "node:crypto";
import {
  BrlaApiService,
  type KycAttempt,
  KycAttemptResult,
  KycAttemptStatus,
  type KycLevel1Payload,
  type KycLevel1Response
} from "@vortexfi/shared";
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

const RECONCILIATION_WINDOW_MS = 15 * 60 * 1000;
const PROVIDER_CLOCK_SKEW_MS = 60 * 1000;

export interface SubmitStandardAveniaKycArgs {
  actorProfileId: string;
  controllingManagerProfileId?: string;
  expectedCustomerEntityId?: string;
  managedProfileId?: string;
  payload: KycLevel1Payload;
  providerCustomer: ProviderCustomer;
  subjectProfileId: string;
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

function assertAuthorizationShape(args: SubmitStandardAveniaKycArgs): void {
  if (!args.controllingManagerProfileId && !args.managedProfileId && !args.expectedCustomerEntityId) {
    if (args.actorProfileId !== args.subjectProfileId) throw managedAccessDenied();
    return;
  }
  if (!args.controllingManagerProfileId || !args.managedProfileId || !args.expectedCustomerEntityId) {
    throw managedAccessDenied();
  }
  if (args.actorProfileId !== args.controllingManagerProfileId && args.actorProfileId !== args.subjectProfileId) {
    throw managedAccessDenied();
  }
}

async function assertCurrentAuthorization(
  args: SubmitStandardAveniaKycArgs,
  transaction: Transaction,
  providerCustomer?: ProviderCustomer | null
): Promise<void> {
  assertAuthorizationShape(args);
  if (!args.controllingManagerProfileId || !args.managedProfileId || !args.expectedCustomerEntityId) return;
  const manager = await ManagedProfileManager.findByPk(args.controllingManagerProfileId, {
    lock: transaction.LOCK.UPDATE,
    transaction
  });
  const relationship = await ManagedProfile.findByPk(args.managedProfileId, { lock: transaction.LOCK.UPDATE, transaction });
  const subject = await User.findByPk(args.subjectProfileId, { lock: transaction.LOCK.UPDATE, transaction });
  const entity = await CustomerEntity.findByPk(args.expectedCustomerEntityId, { lock: transaction.LOCK.UPDATE, transaction });
  if (
    !manager?.isActive ||
    !manager.allowedCorridors.includes("BR") ||
    (manager.allowedCustomerTypes !== null && !manager.allowedCustomerTypes.includes("individual")) ||
    !relationship ||
    relationship.managerProfileId !== args.controllingManagerProfileId ||
    relationship.profileId !== args.subjectProfileId ||
    relationship.status !== "active" ||
    subject?.kind !== "managed" ||
    subject.activeCustomerEntityId !== args.expectedCustomerEntityId ||
    !entity ||
    entity.profileId !== args.subjectProfileId ||
    entity.status !== "active" ||
    entity.type !== "individual" ||
    (providerCustomer ?? args.providerCustomer).customerEntityId !== args.expectedCustomerEntityId
  ) {
    throw managedAccessDenied();
  }
}

async function claimAuthorizedStandardMethod(args: SubmitStandardAveniaKycArgs): Promise<KycCase> {
  return sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(args.providerCustomer.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!providerCustomer || providerCustomer.provider !== "avenia" || providerCustomer.customerType !== "individual") {
      throw conflict("Standard individual Avenia KYC requires an individual Avenia customer");
    }
    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { provider: "avenia", providerCustomerId: providerCustomer.id, type: "kyc" }
    });
    if (cases.length !== 1) throw conflict("Exactly one canonical Avenia KYC case is required");
    const kycCase = cases[0];
    await assertCurrentAuthorization(args, transaction, providerCustomer);
    if (providerCustomer.status === VerificationStatus.Approved || kycCase.status === VerificationStatus.Approved) {
      throw conflict("The Avenia KYC case is already approved");
    }
    if (kycCase.verificationMethod === "sumsub_share_token") throw conflict("This KYC case uses Sumsub token import");
    if (!kycCase.verificationMethod) await kycCase.update({ verificationMethod: "standard" }, { transaction });
    return kycCase;
  });
}

function reconciliationError(): APIError {
  return new APIError({
    isPublic: true,
    message: "The Avenia KYC submission outcome requires reconciliation",
    status: httpStatus.BAD_GATEWAY
  });
}

function preProviderCheckError(): APIError {
  return new APIError({ isPublic: true, message: "Avenia KYC pre-provider checks failed", status: httpStatus.BAD_GATEWAY });
}

function fingerprintPayload(payload: KycLevel1Payload): string {
  const canonicalPayload: Record<keyof KycLevel1Payload, string> = {
    city: payload.city,
    country: payload.country,
    countryOfTaxId: payload.countryOfTaxId,
    dateOfBirth: payload.dateOfBirth,
    email: payload.email,
    fullName: payload.fullName,
    state: payload.state,
    streetAddress: payload.streetAddress,
    subAccountId: payload.subAccountId,
    taxIdNumber: payload.taxIdNumber,
    uploadedDocumentId: payload.uploadedDocumentId,
    uploadedSelfieId: payload.uploadedSelfieId,
    zipCode: payload.zipCode
  };
  return createHash("sha256").update(JSON.stringify(canonicalPayload), "utf8").digest("hex");
}

function assertSubmissionBinding(
  submission: IndividualKycSubmission,
  args: SubmitStandardAveniaKycArgs,
  payloadFingerprint: string,
  allowDifferentPayload = false
): void {
  if (
    submission.actorProfileId !== args.actorProfileId ||
    submission.subjectProfileId !== args.subjectProfileId ||
    (!allowDifferentPayload && submission.payloadFingerprint !== payloadFingerprint)
  ) {
    throw conflict("The Avenia KYC submission does not match this request");
  }
}

async function prepareSubmission(
  args: SubmitStandardAveniaKycArgs,
  kycCaseId: string,
  payloadFingerprint: string
): Promise<KycCase> {
  return sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(args.providerCustomer.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!kycCase || !providerCustomer || kycCase.verificationMethod !== "standard") {
      throw new Error("Standard KYC submission state disappeared");
    }
    await assertCurrentAuthorization(args, transaction, providerCustomer);
    if (kycCase.status === VerificationStatus.Approved || providerCustomer.status === VerificationStatus.Approved) {
      throw conflict("This Avenia customer is already approved");
    }
    const existing = kycCase.verificationSubmission;
    if (existing && existing.status !== "failed") {
      assertSubmissionBinding(existing, args, payloadFingerprint, existing.status === "confirmed");
      return kycCase;
    }
    await kycCase.update(
      {
        verificationSubmission: {
          actorProfileId: args.actorProfileId,
          attemptBaselineIds: [],
          payloadFingerprint,
          status: "prepared",
          subjectProfileId: args.subjectProfileId
        }
      },
      { transaction }
    );
    return kycCase;
  });
}

async function prepareRetrySubmission(
  args: SubmitStandardAveniaKycArgs,
  kycCaseId: string,
  expectedAttemptId: string,
  payloadFingerprint: string
): Promise<KycCase> {
  return sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(args.providerCustomer.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    const previous = kycCase?.verificationSubmission;
    if (
      !providerCustomer ||
      !kycCase ||
      !previous ||
      kycCase.verificationMethod !== "standard" ||
      previous.status !== "confirmed" ||
      kycCase.providerCaseId !== expectedAttemptId
    ) {
      throw reconciliationError();
    }
    await assertCurrentAuthorization(args, transaction, providerCustomer);
    if (kycCase.status === VerificationStatus.Approved || providerCustomer.status === VerificationStatus.Approved) {
      throw conflict("This Avenia customer is already approved");
    }
    assertSubmissionBinding(previous, args, payloadFingerprint, true);
    await kycCase.update(
      {
        verificationSubmission: {
          actorProfileId: args.actorProfileId,
          attemptBaselineIds: [],
          payloadFingerprint,
          status: "prepared",
          subjectProfileId: args.subjectProfileId
        }
      },
      { transaction }
    );
    return kycCase;
  });
}

async function claimPreparedSubmission(
  args: SubmitStandardAveniaKycArgs,
  kycCaseId: string,
  payloadFingerprint: string,
  attemptBaselineIds: string[]
): Promise<APIError | boolean> {
  return sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(args.providerCustomer.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    try {
      await assertCurrentAuthorization(args, transaction, providerCustomer);
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== httpStatus.FORBIDDEN) throw error;
      const submission = kycCase?.verificationSubmission;
      if (kycCase && submission?.status === "prepared") {
        assertSubmissionBinding(submission, args, payloadFingerprint);
        await kycCase.update(
          { verificationSubmission: { ...submission, errorClassification: "authorization_revoked", status: "failed" } },
          { transaction }
        );
      }
      return error;
    }
    const submission = kycCase?.verificationSubmission;
    if (!providerCustomer || !kycCase || !submission || kycCase.verificationMethod !== "standard") {
      throw new Error("Standard KYC submission state disappeared");
    }
    if (kycCase.status === VerificationStatus.Approved || providerCustomer.status === VerificationStatus.Approved) {
      throw conflict("This Avenia customer is already approved");
    }
    assertSubmissionBinding(submission, args, payloadFingerprint);
    if (submission.status !== "prepared") return false;
    await kycCase.update(
      {
        providerCaseId: null,
        submittedAt: new Date(),
        verificationSubmission: { ...submission, attemptBaselineIds, status: "submitted" }
      },
      { transaction }
    );
    return true;
  });
}

async function updateClaim(
  kycCaseId: string,
  values: Partial<IndividualKycSubmission>,
  statuses: IndividualKycSubmission["status"][]
): Promise<void> {
  await sequelize.transaction(async transaction => {
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!kycCase?.verificationSubmission || !statuses.includes(kycCase.verificationSubmission.status)) return;
    await kycCase.update({ verificationSubmission: { ...kycCase.verificationSubmission, ...values } }, { transaction });
  });
}

async function confirmSubmission(kycCaseId: string, providerCustomerId: string, attemptId: string): Promise<void> {
  await sequelize.transaction(async transaction => {
    const providerCustomer = await ProviderCustomer.findByPk(providerCustomerId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    const submission = kycCase?.verificationSubmission;
    if (!providerCustomer || !kycCase || !submission || kycCase.verificationMethod !== "standard") {
      throw new Error("Standard KYC submission claim disappeared");
    }
    if (submission.status === "confirmed") {
      if (kycCase.providerCaseId !== attemptId) throw conflict("The Avenia KYC attempt requires reconciliation");
      return;
    }
    if (submission.status !== "submitted" && submission.status !== "ambiguous") {
      throw new Error("Standard KYC submission claim disappeared");
    }
    await kycCase.update(
      {
        providerCaseId: attemptId,
        ...(kycCase.status === VerificationStatus.Approved
          ? {}
          : {
              approvedAt: null,
              failureReasons: [],
              rejectedAt: null,
              status: VerificationStatus.Pending,
              statusExternal: KycAttemptStatus.PENDING
            }),
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
}

async function quarantineSubmission(kycCaseId: string, attemptId?: string): Promise<void> {
  await sequelize.transaction(async transaction => {
    const kycCase = await KycCase.findByPk(kycCaseId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!kycCase?.verificationSubmission || !["submitted", "ambiguous"].includes(kycCase.verificationSubmission.status)) return;
    await kycCase.update(
      {
        ...(attemptId ? { providerCaseId: attemptId } : {}),
        verificationSubmission: {
          ...kycCase.verificationSubmission,
          errorClassification: attemptId ? "local_confirmation_failed" : "provider_outcome_unknown",
          status: "ambiguous"
        }
      },
      { transaction }
    );
  });
}

function isReconciliationCandidate(attempt: KycAttempt, submittedAt: Date): boolean {
  if (attempt.levelName.startsWith("sumsub-token-")) return false;
  const createdAt = Date.parse(attempt.createdAt);
  return (
    Number.isFinite(createdAt) &&
    createdAt >= submittedAt.getTime() - PROVIDER_CLOCK_SKEW_MS &&
    createdAt <= submittedAt.getTime() + RECONCILIATION_WINDOW_MS + PROVIDER_CLOCK_SKEW_MS
  );
}

async function reconcileSubmission(
  brlaApiService: BrlaApiService,
  kycCaseId: string,
  args: SubmitStandardAveniaKycArgs,
  payloadFingerprint: string
): Promise<KycLevel1Response> {
  const kycCase = await KycCase.findByPk(kycCaseId);
  const submission = kycCase?.verificationSubmission;
  if (!kycCase || !submission) throw reconciliationError();
  assertSubmissionBinding(submission, args, payloadFingerprint);
  if (!kycCase.submittedAt) throw conflict("The Avenia KYC submission requires manual reconciliation");
  let attempt: KycAttempt;
  try {
    if (kycCase.providerCaseId) {
      const response = await brlaApiService.getVerificationAttemptStatus(
        kycCase.providerCaseId,
        args.providerCustomer.providerSubaccountId as string
      );
      if (response.attempt.id !== kycCase.providerCaseId) throw reconciliationError();
      attempt = response.attempt;
    } else {
      const { attempts } = await brlaApiService.getKycAttempts(args.providerCustomer.providerSubaccountId as string);
      const eligible = attempts.filter(candidate => isReconciliationCandidate(candidate, kycCase.submittedAt as Date));
      const bound = eligible.length
        ? await KycCase.findAll({
            attributes: ["providerCaseId"],
            where: { id: { [Op.ne]: kycCase.id }, providerCaseId: { [Op.in]: eligible.map(candidate => candidate.id) } }
          })
        : [];
      const excluded = new Set([...submission.attemptBaselineIds, ...bound.map(row => row.providerCaseId)]);
      const candidates = eligible.filter(candidate => !excluded.has(candidate.id));
      if (candidates.length !== 1) throw conflict("The Avenia KYC submission requires manual reconciliation");
      attempt = candidates[0];
    }
  } catch (error) {
    if (error instanceof APIError) throw error;
    await quarantineSubmission(kycCase.id).catch(() => undefined);
    throw reconciliationError();
  }
  try {
    await confirmSubmission(kycCase.id, args.providerCustomer.id, attempt.id);
  } catch {
    await quarantineSubmission(kycCase.id, attempt.id).catch(() => undefined);
    throw reconciliationError();
  }
  return { id: attempt.id };
}

export async function submitStandardAveniaKyc(args: SubmitStandardAveniaKycArgs): Promise<KycLevel1Response> {
  assertAuthorizationShape(args);
  if (args.providerCustomer.status === VerificationStatus.Approved) throw conflict("This Avenia customer is already approved");
  const claimedCase = await claimAuthorizedStandardMethod(args);
  const payloadFingerprint = fingerprintPayload(args.payload);
  let kycCase = await prepareSubmission(args, claimedCase.id, payloadFingerprint);
  let submission = kycCase.verificationSubmission as IndividualKycSubmission;
  const brlaApiService = BrlaApiService.getInstance();

  if (submission.status === "confirmed") {
    if (!kycCase.providerCaseId) throw reconciliationError();
    let attempt: KycAttempt;
    try {
      const response = await brlaApiService.getVerificationAttemptStatus(
        kycCase.providerCaseId,
        args.providerCustomer.providerSubaccountId as string
      );
      if (response.attempt.id !== kycCase.providerCaseId) throw reconciliationError();
      attempt = response.attempt;
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw reconciliationError();
    }
    const retryableTerminal =
      attempt.retryable === true &&
      (attempt.status === KycAttemptStatus.EXPIRED ||
        (attempt.status === KycAttemptStatus.COMPLETED && attempt.result === KycAttemptResult.REJECTED));
    if (!retryableTerminal) {
      assertSubmissionBinding(submission, args, payloadFingerprint);
      return { id: kycCase.providerCaseId };
    }
    kycCase = await prepareRetrySubmission(args, kycCase.id, kycCase.providerCaseId, payloadFingerprint);
    submission = kycCase.verificationSubmission as IndividualKycSubmission;
  }
  if (submission.status !== "prepared") {
    return reconcileSubmission(brlaApiService, kycCase.id, args, payloadFingerprint);
  }

  let attemptBaselineIds: string[];
  try {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const [{ documents }, { attempts }] = await Promise.all([
      brlaApiService.getUploadedDocuments(args.payload.subAccountId),
      brlaApiService.getKycAttempts(args.payload.subAccountId)
    ]);
    const requiredDocumentIds = [args.payload.uploadedDocumentId, args.payload.uploadedSelfieId];
    if (!requiredDocumentIds.every(id => documents.some(document => document.id === id && document.ready === true))) {
      throw preProviderCheckError();
    }
    attemptBaselineIds = [...new Set(attempts.map(attempt => attempt.id))];
  } catch {
    await updateClaim(kycCase.id, { errorClassification: "pre_provider_check_failed", status: "failed" }, ["prepared"]);
    throw preProviderCheckError();
  }

  const claimed = await claimPreparedSubmission(args, kycCase.id, payloadFingerprint, attemptBaselineIds);
  if (claimed instanceof APIError) throw claimed;
  if (!claimed) {
    const concurrent = await KycCase.findByPk(kycCase.id);
    const concurrentSubmission = concurrent?.verificationSubmission;
    if (!concurrent || !concurrentSubmission) throw new Error("Standard KYC submission claim disappeared");
    assertSubmissionBinding(concurrentSubmission, args, payloadFingerprint);
    if (concurrentSubmission.status === "confirmed" && concurrent.providerCaseId) return { id: concurrent.providerCaseId };
    if (concurrentSubmission.status === "failed") throw preProviderCheckError();
    return reconcileSubmission(brlaApiService, concurrent.id, args, payloadFingerprint);
  }

  let attemptId: string;
  try {
    attemptId = (await brlaApiService.submitKycLevel1(args.payload)).id;
  } catch {
    await quarantineSubmission(kycCase.id).catch(() => undefined);
    throw reconciliationError();
  }
  try {
    await confirmSubmission(kycCase.id, args.providerCustomer.id, attemptId);
  } catch {
    await quarantineSubmission(kycCase.id, attemptId).catch(() => undefined);
    throw reconciliationError();
  }
  return { id: attemptId };
}
