import { AveniaAccountType, normalizeTaxId } from "@vortexfi/shared";
import httpStatus from "http-status";
import ProviderCustomer, { AveniaKycStatus } from "../../models/providerCustomer.model";
import { APIError } from "../errors/api-error";
import { customerTypeToAccountType } from "./avenia/avenia-customer.service";
import { getOrCreateCustomerEntityForProfile } from "./customer-entity.service";

export interface ResolvedAveniaAccount {
  taxId: string;
  subAccountId: string;
  accountType: AveniaAccountType;
  providerCustomer: ProviderCustomer;
}

/**
 * Resolve the canonical Avenia account for a user. Subaccounts in `Consulted`/`Requested` states
 * are not considered ramp-execution ready; they are reserved for KYC flows.
 */
export async function resolveAveniaAccountForUser(userId: string): Promise<ResolvedAveniaAccount> {
  const entity = await getOrCreateCustomerEntityForProfile(userId);
  const candidates = await ProviderCustomer.findAll({
    where: {
      customerEntityId: entity.id,
      provider: "avenia",
      status: AveniaKycStatus.Accepted
    }
  });

  if (candidates.length === 0) {
    throw new APIError({
      message: "No completed Avenia profile found for this API key user.",
      status: httpStatus.BAD_REQUEST
    });
  }

  if (candidates.length > 1) {
    throw new APIError({
      message: `Multiple completed Avenia profiles found for this API key user (${candidates.length}). Account selection is not yet supported.`,
      status: httpStatus.BAD_REQUEST
    });
  }

  const providerCustomer = candidates[0];
  if (!providerCustomer.providerSubaccountId || !providerCustomer.taxReference) {
    throw new APIError({
      message: "Avenia subaccount is not yet provisioned for this user.",
      status: httpStatus.BAD_REQUEST
    });
  }

  return {
    accountType: customerTypeToAccountType(providerCustomer.customerType),
    providerCustomer,
    subAccountId: providerCustomer.providerSubaccountId,
    taxId: normalizeTaxId(providerCustomer.taxReference)
  };
}

/**
 * Mirrors `resolveAveniaAccountForUser` but allows the request to provide an
 * optional override taxId; if provided, it MUST match the derived one or
 * registration is rejected.
 */
export async function resolveAveniaAccountForRamp(userId: string, providedTaxId?: string): Promise<ResolvedAveniaAccount> {
  const resolved = await resolveAveniaAccountForUser(userId);

  if (providedTaxId && normalizeTaxId(providedTaxId) !== resolved.taxId) {
    throw new APIError({
      message: "taxId does not match existing records",
      status: httpStatus.BAD_REQUEST
    });
  }

  return resolved;
}
