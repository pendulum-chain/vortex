import { AlfredPayCountry, AlfredPayStatus, AlfredpayCustomerType } from "@vortexfi/shared";
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

function toAlfredPayStatus(record: ProviderCustomer): AlfredPayStatus {
  switch (record.statusExternal) {
    case "IN_REVIEW":
      return AlfredPayStatus.Verifying;
    case "FAILED":
      return AlfredPayStatus.Failed;
    case "COMPLETED":
      return AlfredPayStatus.Success;
    case "UPDATE_REQUIRED":
      return AlfredPayStatus.UpdateRequired;
    case "CREATED":
      return AlfredPayStatus.Consulted;
    default:
      if (record.status === VerificationStatus.Approved) return AlfredPayStatus.Success;
      if (record.status === VerificationStatus.Rejected) return AlfredPayStatus.Failed;
      if (record.status === VerificationStatus.InReview) return AlfredPayStatus.UserCompleted;
      if (record.status === VerificationStatus.Started) return AlfredPayStatus.Consulted;
      return AlfredPayStatus.Consulted;
  }
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
