import { AlfredPayCountry, AlfredPayStatus, AlfredpayCustomerType } from "@vortexfi/shared";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { ProviderCustomerType } from "../../../models/providerCustomer.model";
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
  update(changes: Partial<{ status: AlfredPayStatus; lastFailureReasons: string[] }>): Promise<void>;
}

async function syncKycCase(record: ProviderCustomer, status: AlfredPayStatus): Promise<void> {
  const lifecycle = {
    ...(status === AlfredPayStatus.Success ? { approvedAt: new Date() } : {}),
    ...(status === AlfredPayStatus.Failed ? { rejectedAt: new Date() } : {})
  };
  const existing = await KycCase.findOne({ where: { providerCustomerId: record.id } });
  if (existing) {
    await existing.update({ failureReasons: record.lastFailureReasons ?? [], status, ...lifecycle });
    return;
  }
  await KycCase.create({
    customerEntityId: record.customerEntityId,
    failureReasons: record.lastFailureReasons ?? [],
    level: "level_1",
    provider: "alfredpay",
    providerCustomerId: record.id,
    status,
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
    status: record.status as AlfredPayStatus,
    type: customerTypeToAlfredpayType(record.customerType),
    async update(changes) {
      await record.update({
        ...(changes.status !== undefined ? { status: changes.status } : {}),
        ...(changes.lastFailureReasons !== undefined ? { lastFailureReasons: changes.lastFailureReasons } : {})
      });
      this.status = record.status as AlfredPayStatus;
      this.lastFailureReasons = record.lastFailureReasons;
      if (changes.status !== undefined) {
        await syncKycCase(record, changes.status);
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
  const entity = await getOrCreateCustomerEntityForProfile(userId);
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
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  const record = await ProviderCustomer.create({
    country: values.country,
    customerEntityId: entity.id,
    customerType: alfredpayTypeToCustomerType(values.type),
    provider: "alfredpay",
    providerCustomerId: values.alfredPayId,
    rail: COUNTRY_RAIL[values.country] ?? null,
    status: values.status
  });
  await syncKycCase(record, values.status);
  return toView(record);
}
