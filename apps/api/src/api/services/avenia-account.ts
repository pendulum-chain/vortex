import { AveniaAccountType, normalizeTaxId } from "@vortexfi/shared";
import httpStatus from "http-status";
import TaxId, { TaxIdInternalStatus } from "../../models/taxId.model";
import { APIError } from "../errors/api-error";

export interface ResolvedAveniaAccount {
  taxId: string;
  subAccountId: string;
  accountType: AveniaAccountType;
  taxIdRecord: TaxId;
}

/**
 * Resolve the canonical Avenia account for a user. Subaccounts in `Consulted`/`Requested` states
 * are not considered ramp-execution ready; they are reserved for KYC flows.
 */
export async function resolveAveniaAccountForUser(userId: string): Promise<ResolvedAveniaAccount> {
  const candidates = await TaxId.findAll({
    where: {
      internalStatus: TaxIdInternalStatus.Accepted,
      userId
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

  const taxIdRecord = candidates[0];
  if (!taxIdRecord.subAccountId) {
    throw new APIError({
      message: "Avenia subaccount is not yet provisioned for this user.",
      status: httpStatus.BAD_REQUEST
    });
  }

  return {
    accountType: taxIdRecord.accountType,
    subAccountId: taxIdRecord.subAccountId,
    taxId: normalizeTaxId(taxIdRecord.taxId),
    taxIdRecord
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
