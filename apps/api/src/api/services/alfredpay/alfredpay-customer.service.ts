import { AlfredPayCountry, AlfredPayStatus, AlfredpayApiService, AlfredpayCustomerType } from "@vortexfi/shared";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { ProviderCustomerType, VerificationStatus } from "../../../models/providerCustomer.model";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";

export function alfredpayTypeToCustomerType(type: AlfredpayCustomerType): ProviderCustomerType {
  return type === AlfredpayCustomerType.BUSINESS ? "business" : "individual";
}

export function customerTypeToAlfredpayType(customerType: ProviderCustomerType): AlfredpayCustomerType {
  return customerType === "business" ? AlfredpayCustomerType.BUSINESS : AlfredpayCustomerType.INDIVIDUAL;
}

const COUNTRY_RAIL: Record<string, string> = {
  AR: "ars",
  BO: "bob",
  BR: "brl",
  CL: "clp",
  CN: "cny",
  CO: "cop",
  DO: "dop",
  HK: "hkd",
  MX: "mxn",
  PE: "pen",
  US: "usd"
};

/**
 * Legacy-shaped view over an alfredpay `provider_customers` row: exposes the pre-cutover
 * alfredpay_customers field names so the controller's status machine reads verbatim, and
 * mirrors status transitions into the account's kyc_case.
 */
export interface AlfredpayCustomerView {
  alfredPayId: string;
  country: AlfredPayCountry;
  type: AlfredpayCustomerType;
  status: AlfredPayStatus;
  lastFailureReasons: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  update(
    changes: Partial<{
      status: AlfredPayStatus;
      verificationStatus: VerificationStatus;
      statusExternal: string | null;
      lastFailureReasons: string[];
    }>
  ): Promise<void>;
}

function toVerificationStatus(status: AlfredPayStatus): VerificationStatus {
  switch (status) {
    case AlfredPayStatus.Success:
      return VerificationStatus.Approved;
    case AlfredPayStatus.Failed:
      return VerificationStatus.Rejected;
    case AlfredPayStatus.UserCompleted:
    case AlfredPayStatus.Verifying:
      return VerificationStatus.InReview;
    case AlfredPayStatus.Consulted:
    case AlfredPayStatus.LinkOpened:
    case AlfredPayStatus.UpdateRequired:
      return VerificationStatus.Started;
    default:
      return VerificationStatus.Pending;
  }
}

/**
 * Maps a decisive Alfredpay status string — a fresh submission status or a stored `statusExternal` —
 * to our AlfredPayStatus. KYC and KYB share this vocabulary. CREATED and anything not yet decided
 * return null so callers can leave a stored status untouched. Mirrors AlfredpayController.mapKycStatus.
 */
function providerStatusToAlfredPayStatus(status: string | null): AlfredPayStatus | null {
  switch (status) {
    case "IN_REVIEW":
      return AlfredPayStatus.Verifying;
    case "FAILED":
      return AlfredPayStatus.Failed;
    case "COMPLETED":
      return AlfredPayStatus.Success;
    case "UPDATE_REQUIRED":
      return AlfredPayStatus.UpdateRequired;
    default:
      return null;
  }
}

function toAlfredPayStatus(record: ProviderCustomer): AlfredPayStatus {
  const decided = providerStatusToAlfredPayStatus(record.statusExternal);
  if (decided) return decided;
  if (record.statusExternal === "CREATED") return AlfredPayStatus.Consulted;
  if (record.status === VerificationStatus.Approved) return AlfredPayStatus.Success;
  if (record.status === VerificationStatus.Rejected) return AlfredPayStatus.Failed;
  if (record.status === VerificationStatus.InReview) return AlfredPayStatus.UserCompleted;
  if (record.status === VerificationStatus.Started) return AlfredPayStatus.Consulted;
  return AlfredPayStatus.Consulted;
}

async function syncKycCase(record: ProviderCustomer): Promise<void> {
  const lifecycle = {
    ...(record.status === VerificationStatus.Approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
    ...(record.status === VerificationStatus.Rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
  };
  const existing = await KycCase.findOne({ where: { providerCustomerId: record.id } });
  if (existing) {
    await existing.update({
      failureReasons: record.lastFailureReasons ?? [],
      status: record.status,
      statusExternal: record.statusExternal,
      ...lifecycle
    });
    return;
  }
  await KycCase.create({
    customerEntityId: record.customerEntityId,
    failureReasons: record.lastFailureReasons ?? [],
    level: "level_1",
    provider: "alfredpay",
    providerCustomerId: record.id,
    status: record.status,
    statusExternal: record.statusExternal,
    type: record.customerType === "business" ? "kyb" : "kyc",
    ...lifecycle
  });
}

function toView(record: ProviderCustomer): AlfredpayCustomerView {
  return {
    alfredPayId: record.providerCustomerId ?? "",
    country: record.country as AlfredPayCountry,
    createdAt: record.createdAt,
    lastFailureReasons: record.lastFailureReasons,
    status: toAlfredPayStatus(record),
    type: customerTypeToAlfredpayType(record.customerType),
    async update(changes) {
      await record.update({
        ...(changes.verificationStatus !== undefined
          ? { status: changes.verificationStatus }
          : changes.status !== undefined
            ? { status: toVerificationStatus(changes.status) }
            : {}),
        ...(changes.statusExternal !== undefined ? { statusExternal: changes.statusExternal } : {}),
        ...(changes.lastFailureReasons !== undefined ? { lastFailureReasons: changes.lastFailureReasons } : {})
      });
      this.status = changes.status ?? toAlfredPayStatus(record);
      this.lastFailureReasons = record.lastFailureReasons;
      if (changes.status !== undefined || changes.verificationStatus !== undefined || changes.statusExternal !== undefined) {
        await syncKycCase(record);
      }
    },
    updatedAt: record.updatedAt
  };
}

/**
 * Latest alfredpay account for (user, country[, type]) — reproduces the legacy
 * updatedAt-DESC tie-break across a user's individual/business rows.
 */
export async function findAlfredpayCustomer(
  userId: string,
  country: AlfredPayCountry,
  type?: AlfredpayCustomerType
): Promise<AlfredpayCustomerView | null> {
  const entity = await getOrCreateCustomerEntityForProfile(userId, type ? alfredpayTypeToCustomerType(type) : undefined);
  const record = await ProviderCustomer.findOne({
    order: [["updatedAt", "DESC"]],
    where: {
      country,
      customerEntityId: entity.id,
      provider: "alfredpay",
      ...(type ? { customerType: alfredpayTypeToCustomerType(type) } : {})
    }
  });
  return record ? toView(record) : null;
}

/**
 * Refreshes a stored Alfredpay account against the provider so an outcome that lands after the KYC
 * wizard was closed (e.g. the provider approving an already-submitted customer) is reflected by the
 * onboarding-status aggregator without the user reopening the flow. Best-effort: a provider failure
 * or a customer with no submission yet leaves the stored status untouched so aggregation keeps
 * serving. The linked kyc_case is synced through the shared view.
 */
export async function refreshAlfredpayCustomerStatus(record: ProviderCustomer): Promise<void> {
  const view = toView(record);
  const service = AlfredpayApiService.getInstance();
  const isBusiness = record.customerType === "business";
  try {
    const lastSubmission = isBusiness
      ? await service.getLastKybSubmission(view.alfredPayId)
      : await service.getLastKycSubmission(view.alfredPayId);
    if (!lastSubmission?.submissionId) {
      return;
    }
    const statusResponse = isBusiness
      ? await service.getKybStatus(view.alfredPayId, lastSubmission.submissionId)
      : await service.getKycStatus(view.alfredPayId, lastSubmission.submissionId);
    const mapped = providerStatusToAlfredPayStatus(statusResponse.status);
    if (!mapped) {
      return;
    }
    await view.update({
      status: mapped,
      statusExternal: statusResponse.status,
      ...(mapped === AlfredPayStatus.Failed && statusResponse.metadata?.failureReason
        ? { lastFailureReasons: [statusResponse.metadata.failureReason] }
        : {})
    });
  } catch {
    // Keep the stored status if the provider is unavailable or has no submission yet.
  }
}

export async function createAlfredpayCustomer(
  userId: string,
  values: { alfredPayId: string; country: AlfredPayCountry; status: AlfredPayStatus; type: AlfredpayCustomerType }
): Promise<AlfredpayCustomerView> {
  const customerType = alfredpayTypeToCustomerType(values.type);
  const entity = await getOrCreateCustomerEntityForProfile(userId, customerType);
  const record = await ProviderCustomer.create({
    country: values.country,
    customerEntityId: entity.id,
    customerType,
    provider: "alfredpay",
    providerCustomerId: values.alfredPayId,
    rail: COUNTRY_RAIL[values.country] ?? null,
    status: toVerificationStatus(values.status)
  });
  await syncKycCase(record);
  return toView(record);
}
