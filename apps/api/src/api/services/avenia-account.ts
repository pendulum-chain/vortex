import { AveniaAccountType, normalizeTaxId } from "@vortexfi/shared";
import httpStatus from "http-status";
import { Op } from "sequelize";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import User from "../../models/user.model";
import { APIError } from "../errors/api-error";
import { customerTypeToAccountType } from "./avenia/avenia-customer.service";
import { findCustomerEntityIdsForProfile } from "./customer-entity.service";

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
  // Profile-wide scope: migration 040 attached legacy rows to the profile's individual
  // entity, so the approved account may not sit on the active entity.
  const ownedEntityIds = await findCustomerEntityIdsForProfile(userId);
  const candidates = ownedEntityIds.length
    ? await ProviderCustomer.findAll({
        where: {
          customerEntityId: { [Op.in]: ownedEntityIds },
          provider: "avenia",
          status: VerificationStatus.Approved
        }
      })
    : [];

  if (candidates.length === 0) {
    throw new APIError({
      message: "No completed Avenia profile found for this API key user.",
      status: httpStatus.BAD_REQUEST
    });
  }

  let providerCustomer = candidates[0];
  if (candidates.length > 1) {
    // A multi-entity profile can own several approved accounts (e.g. a migrated
    // individual row plus a KYB'd business row): the active entity's account wins.
    const profile = await User.findByPk(userId);
    const preferred = candidates.filter(candidate => candidate.customerEntityId === profile?.activeCustomerEntityId);
    if (preferred.length !== 1) {
      throw new APIError({
        message: `Multiple completed Avenia profiles found for this API key user (${candidates.length}). Account selection is not yet supported.`,
        status: httpStatus.BAD_REQUEST
      });
    }
    providerCustomer = preferred[0];
  }
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
