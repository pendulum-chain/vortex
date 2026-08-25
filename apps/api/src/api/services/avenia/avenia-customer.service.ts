import { AveniaAccountType, BrlaApiService, normalizeTaxId } from "@vortexfi/shared";
import crypto from "crypto";
import type { Transaction } from "sequelize";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import CustomerEntity from "../../../models/customerEntity.model";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { ProviderCustomerType, VerificationStatus } from "../../../models/providerCustomer.model";
import { VerificationSubject } from "../email/types";
import { enqueueVerificationNotification, mapKycFailureReason, NotifiableAttempt } from "./verification-notifications";

export function hashTaxReference(taxId: string): string {
  return crypto.createHash("sha256").update(normalizeTaxId(taxId), "utf8").digest("hex");
}

export function assertAveniaImportedTaxIdentity(
  customer: ProviderCustomer,
  account: Awaited<ReturnType<BrlaApiService["subaccountInfo"]>>
): void {
  const taxId = account?.accountInfo.taxId;
  if (typeof taxId === "string" && taxId.trim() && hashTaxReference(taxId) !== customer.taxReferenceHash) {
    throw new Error("The imported KYC identity does not match the canonical customer");
  }
}

export function maskTaxReference(taxId: string): string {
  const normalized = normalizeTaxId(taxId);
  return "*".repeat(Math.max(normalized.length - 4, 0)) + normalized.slice(-4);
}

export function accountTypeToCustomerType(accountType: AveniaAccountType): ProviderCustomerType {
  return accountType === AveniaAccountType.COMPANY ? "business" : "individual";
}

export function customerTypeToAccountType(customerType: ProviderCustomerType): AveniaAccountType {
  return customerType === "business" ? AveniaAccountType.COMPANY : AveniaAccountType.INDIVIDUAL;
}

/** Looks up the Avenia provider account by (raw or normalized) tax id via its sha256 hash. */
export async function findAveniaCustomerByTaxId(taxId: string, transaction?: Transaction): Promise<ProviderCustomer | null> {
  return ProviderCustomer.findOne({
    ...(transaction ? { transaction } : {}),
    where: { provider: "avenia", taxReferenceHash: hashTaxReference(taxId) }
  });
}

export async function findAveniaCustomerBySubaccountId(subAccountId: string): Promise<ProviderCustomer | null> {
  return ProviderCustomer.findOne({
    where: { provider: "avenia", providerSubaccountId: subAccountId }
  });
}

/**
 * The profile owning a subaccount, or null when the subaccount is unknown or is
 * partner-owned — the latter has no profile behind it and so nobody to notify.
 */
export async function findAveniaOwnerBySubaccountId(
  subAccountId: string
): Promise<{ accountType: AveniaAccountType; profileId: string } | null> {
  const customer = await findAveniaCustomerBySubaccountId(subAccountId);
  if (!customer) {
    return null;
  }

  const entity = await CustomerEntity.findByPk(customer.customerEntityId);
  if (!entity?.profileId) {
    return null;
  }

  return { accountType: customerTypeToAccountType(customer.customerType), profileId: entity.profileId };
}

/**
 * Keeps the single kyc_case per Avenia account in sync with the account status (the
 * migration backfilled exactly one case per provider account; runtime transitions update
 * it in the same code path — these are two new tables, not a legacy dual-write).
 */
export async function upsertAveniaKycCase(
  record: ProviderCustomer,
  status: VerificationStatus,
  statusExternal: string | null = record.statusExternal,
  providerCaseId?: string,
  transaction?: Transaction
): Promise<void> {
  const lifecycle = {
    ...(status === VerificationStatus.InReview ? { submittedAt: new Date() } : {}),
    ...(status === VerificationStatus.Approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
    ...(status === VerificationStatus.Rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
  };

  const existing = await KycCase.findOne({
    ...(transaction ? { transaction } : {}),
    where: { providerCustomerId: record.id }
  });
  if (existing) {
    const values = {
      ...(providerCaseId ? { providerCaseId } : {}),
      status,
      statusExternal,
      ...lifecycle
    };
    await (transaction ? existing.update(values, { transaction }) : existing.update(values));
    return;
  }
  const values = {
    customerEntityId: record.customerEntityId,
    level: "level_1",
    provider: "avenia" as const,
    providerCaseId,
    providerCustomerId: record.id,
    status,
    statusExternal,
    type: record.customerType === "business" ? ("kyb" as const) : ("kyc" as const),
    ...lifecycle
  };
  await (transaction ? KycCase.create(values, { transaction }) : KycCase.create(values));
}

/**
 * Poll-driven KYC outcome transition: flips an account to Approved/Rejected based on the
 * latest provider attempt (the only mechanism that makes a subaccount ramp-ready). Approval
 * is terminal — an Approved account is never downgraded by a stale attempt read — but a
 * `rejected` account follows a successful retried attempt to Approved (the legacy
 * `WHERE internal_status = 'Requested'` guard left it stuck in `Rejected`, so the user's
 * approved KYC never became ramp-ready). Repeated polls also reconcile either canonical row.
 */
export async function updateAveniaKycOutcome(
  taxId: string,
  outcome: VerificationStatus.Approved | VerificationStatus.Rejected,
  statusExternal: string,
  expectedCase: { id: string; providerCaseId: string | null }
): Promise<void> {
  const record = await findAveniaCustomerByTaxId(taxId);
  if (!record) return;
  await updateAveniaKycOutcomeForCustomer(record, outcome, statusExternal, expectedCase);
}

export async function updateAveniaKycOutcomeForCustomer(
  record: ProviderCustomer,
  outcome: VerificationStatus.Approved | VerificationStatus.Rejected,
  statusExternal: string,
  expectedCase: { id: string; providerCaseId: string | null },
  // When the caller holds the settled attempt, a terminal transition also persists its
  // mapped failure reason and enqueues the outcome email — parity with the authenticated
  // KYB route, so whichever path wins the race leaves the same state behind.
  notify?: { attempt: NotifiableAttempt; profileId: string; subject: VerificationSubject }
): Promise<ProviderCustomer> {
  return sequelize.transaction(async transaction => {
    const lockedRecord = await ProviderCustomer.findByPk(record.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!lockedRecord) throw new Error("Avenia customer disappeared during KYC outcome persistence");

    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { id: expectedCase.id, providerCaseId: expectedCase.providerCaseId, providerCustomerId: lockedRecord.id }
    });
    if (cases.length !== 1) throw new Error("The KYC case binding requires reconciliation");
    const kycCase = cases[0];
    if (
      expectedCase.providerCaseId === null &&
      (kycCase.verificationSubmission?.status === "submitted" || kycCase.verificationSubmission?.status === "ambiguous")
    ) {
      throw new Error("The KYC case binding requires reconciliation");
    }

    const approved =
      outcome === VerificationStatus.Approved ||
      lockedRecord.status === VerificationStatus.Approved ||
      kycCase.status === VerificationStatus.Approved;
    const status = approved ? VerificationStatus.Approved : VerificationStatus.Rejected;
    const effectiveStatusExternal =
      outcome === VerificationStatus.Approved || !approved
        ? statusExternal
        : lockedRecord.status === VerificationStatus.Approved
          ? lockedRecord.statusExternal
          : kycCase.statusExternal;
    const now = new Date();

    // Side effects follow the outcome that was actually persisted: a stale rejected read
    // arriving after an approval keeps the approval and must not record a failure reason
    // or email a rejection.
    const appliedNotify = notify && (outcome === VerificationStatus.Approved || !approved) ? notify : undefined;
    const failureReason = appliedNotify && !approved ? mapKycFailureReason(appliedNotify.attempt.resultMessage) : null;

    await lockedRecord.update(
      {
        status,
        statusExternal: effectiveStatusExternal,
        ...(appliedNotify ? { lastFailureReasons: failureReason ? [failureReason] : [] } : {})
      },
      { transaction }
    );
    await kycCase.update(
      {
        approvedAt: approved ? (kycCase.approvedAt ?? now) : null,
        rejectedAt: approved ? null : (kycCase.rejectedAt ?? now),
        status,
        statusExternal: effectiveStatusExternal,
        ...(appliedNotify ? { failureReasons: failureReason ? [failureReason] : [] } : {})
      },
      { transaction }
    );
    if (appliedNotify) {
      // Queue only after the case binding was proven above. Enqueuing is idempotent on the
      // attempt id, and a queue failure rolls back the terminal state so a later poll can
      // retry the notification (parity with GET /v1/brla/kyb/attempt-status).
      await enqueueVerificationNotification(appliedNotify.attempt, appliedNotify.profileId, appliedNotify.subject);
    }
    return lockedRecord;
  });
}

export async function updateAveniaKycProgressForCustomer(
  record: ProviderCustomer,
  expectedCase: { id: string; providerCaseId: string | null },
  status: VerificationStatus.Pending | VerificationStatus.InReview,
  statusExternal: string | null
): Promise<ProviderCustomer> {
  return sequelize.transaction(async transaction => {
    const lockedRecord = await ProviderCustomer.findByPk(record.id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!lockedRecord) throw new Error("Avenia customer disappeared during KYC progress persistence");

    const cases = await KycCase.findAll({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: {
        id: expectedCase.id,
        providerCaseId: expectedCase.providerCaseId,
        providerCustomerId: lockedRecord.id
      }
    });
    if (cases.length !== 1) throw new Error("The KYC case binding requires reconciliation");
    const kycCase = cases[0];
    if (
      expectedCase.providerCaseId === null &&
      (kycCase.verificationSubmission?.status === "submitted" || kycCase.verificationSubmission?.status === "ambiguous")
    ) {
      throw new Error("The KYC case binding requires reconciliation");
    }

    const terminalStatus = [lockedRecord.status, kycCase.status].includes(VerificationStatus.Approved)
      ? VerificationStatus.Approved
      : [lockedRecord.status, kycCase.status].includes(VerificationStatus.Rejected)
        ? VerificationStatus.Rejected
        : null;
    if (terminalStatus) {
      const terminalStatusExternal =
        lockedRecord.status === terminalStatus ? lockedRecord.statusExternal : kycCase.statusExternal;
      const now = new Date();
      await lockedRecord.update({ status: terminalStatus, statusExternal: terminalStatusExternal }, { transaction });
      await kycCase.update(
        {
          approvedAt: terminalStatus === VerificationStatus.Approved ? (kycCase.approvedAt ?? now) : null,
          rejectedAt: terminalStatus === VerificationStatus.Rejected ? (kycCase.rejectedAt ?? now) : null,
          status: terminalStatus,
          statusExternal: terminalStatusExternal
        },
        { transaction }
      );
      return lockedRecord;
    }

    await lockedRecord.update({ status, statusExternal }, { transaction });
    await kycCase.update({ status, statusExternal }, { transaction });
    return lockedRecord;
  });
}

/**
 * Best-effort hydration of `company_name` for business Avenia accounts whose row was
 * created before the field was backfilled (or whose provider read was unavailable at
 * creation). Idempotent: a no-op once a non-empty name is stored, and never runs for
 * individual accounts. Swallows provider failures so callers can keep serving status.
 */
export async function hydrateAveniaCompanyName(customer: ProviderCustomer): Promise<void> {
  if (customer.provider !== "avenia" || customer.customerType !== "business") {
    return;
  }
  if (customer.companyName?.trim() || !customer.providerSubaccountId) {
    return;
  }
  try {
    const account = await BrlaApiService.getInstance().subaccountInfo(customer.providerSubaccountId);
    const companyName = account?.accountInfo.name?.trim() || account?.accountInfo.fullName?.trim();
    if (companyName) {
      await customer.update({ companyName });
    }
  } catch (error) {
    logger.warn("hydrateAveniaCompanyName: Avenia subaccountInfo unavailable, skipping backfill:", error);
  }
}
