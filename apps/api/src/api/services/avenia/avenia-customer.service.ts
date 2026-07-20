import { AveniaAccountType, BrlaApiService, normalizeTaxId } from "@vortexfi/shared";
import crypto from "crypto";
import logger from "../../../config/logger";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { ProviderCustomerType, VerificationStatus } from "../../../models/providerCustomer.model";

export function hashTaxReference(taxId: string): string {
  return crypto.createHash("sha256").update(normalizeTaxId(taxId), "utf8").digest("hex");
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
export async function findAveniaCustomerByTaxId(taxId: string): Promise<ProviderCustomer | null> {
  return ProviderCustomer.findOne({
    where: { provider: "avenia", taxReferenceHash: hashTaxReference(taxId) }
  });
}

export async function findAveniaCustomerBySubaccountId(subAccountId: string): Promise<ProviderCustomer | null> {
  return ProviderCustomer.findOne({
    where: { provider: "avenia", providerSubaccountId: subAccountId }
  });
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
  providerCaseId?: string
): Promise<void> {
  const lifecycle = {
    ...(status === VerificationStatus.InReview ? { submittedAt: new Date() } : {}),
    ...(status === VerificationStatus.Approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
    ...(status === VerificationStatus.Rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
  };

  const existing = await KycCase.findOne({ where: { providerCustomerId: record.id } });
  if (existing) {
    await existing.update({ ...(providerCaseId ? { providerCaseId } : {}), status, statusExternal, ...lifecycle });
    return;
  }
  await KycCase.create({
    customerEntityId: record.customerEntityId,
    level: "level_1",
    provider: "avenia",
    providerCaseId,
    providerCustomerId: record.id,
    status,
    statusExternal,
    type: record.customerType === "business" ? "kyb" : "kyc",
    ...lifecycle
  });
}

/**
 * Poll-driven KYC outcome transition: flips an account to Approved/Rejected based on the
 * latest provider attempt (the only mechanism that makes a subaccount ramp-ready). Approval
 * is terminal — an Approved account is never downgraded by a stale attempt read — but a
 * `rejected` account follows a successful retried attempt to Approved (the legacy
 * `WHERE internal_status = 'Requested'` guard left it stuck in `Rejected`, so the user's
 * approved KYC never became ramp-ready). Repeated polls of an unchanged outcome no-op.
 */
export async function updateAveniaKycOutcome(
  taxId: string,
  outcome: VerificationStatus.Approved | VerificationStatus.Rejected,
  statusExternal: string
): Promise<void> {
  const record = await findAveniaCustomerByTaxId(taxId);
  if (!record || record.status === VerificationStatus.Approved) {
    return;
  }
  if (record.status === outcome && record.statusExternal === statusExternal) {
    return;
  }
  await record.update({ status: outcome, statusExternal });
  await upsertAveniaKycCase(record, outcome, statusExternal);
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
