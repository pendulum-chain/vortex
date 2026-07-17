import { MykoboApiError, MykoboApiService, MykoboCustomerStatus, MykoboProfile, mapMykoboReviewStatus } from "@vortexfi/shared";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";

interface UpsertArgs {
  userId: string;
  email: string;
  status: VerificationStatus;
  statusExternal: string | null;
}

function toVerificationStatus(status: MykoboCustomerStatus): VerificationStatus {
  switch (status) {
    case MykoboCustomerStatus.APPROVED:
      return VerificationStatus.Approved;
    case MykoboCustomerStatus.REJECTED:
      return VerificationStatus.Rejected;
    case MykoboCustomerStatus.PENDING:
      return VerificationStatus.InReview;
    default:
      return VerificationStatus.Pending;
  }
}

async function syncKycCase(record: ProviderCustomer): Promise<void> {
  const values = {
    status: record.status,
    statusExternal: record.statusExternal,
    ...(record.status === VerificationStatus.Approved ? { approvedAt: new Date(), rejectedAt: null } : {}),
    ...(record.status === VerificationStatus.Rejected ? { approvedAt: null, rejectedAt: new Date() } : {})
  };
  const existing = await KycCase.findOne({ where: { providerCustomerId: record.id } });
  if (existing) {
    await existing.update(values);
    return;
  }
  await KycCase.create({
    customerEntityId: record.customerEntityId,
    provider: "mykobo",
    providerCustomerId: record.id,
    type: "kyc",
    ...values
  });
}

async function upsertMykoboCustomer({ userId, email, status, statusExternal }: UpsertArgs): Promise<void> {
  const entity = await getOrCreateCustomerEntityForProfile(userId, "individual");
  const existing = await ProviderCustomer.findOne({
    where: { customerEntityId: entity.id, provider: "mykobo" }
  });
  if (existing) {
    // The Mykobo-side durable key is the email; keep the mirror in sync with the profile.
    await existing.update({ providerCustomerId: email, status, statusExternal });
    await syncKycCase(existing);
    return;
  }
  const record = await ProviderCustomer.create({
    customerEntityId: entity.id,
    provider: "mykobo",
    providerCustomerId: email,
    rail: "eur",
    status,
    statusExternal
  });
  await syncKycCase(record);
}

export async function upsertMykoboCustomerFromProfile(userId: string, email: string, profile: MykoboProfile): Promise<void> {
  const reviewStatus = profile.kyc_status?.review_status ?? null;
  await upsertMykoboCustomer({
    email,
    status: toVerificationStatus(mapMykoboReviewStatus(reviewStatus)),
    statusExternal: reviewStatus,
    userId
  });
}

export async function markMykoboCustomerStarted(userId: string, email: string): Promise<void> {
  await upsertMykoboCustomer({ email, status: VerificationStatus.Started, statusExternal: null, userId });
}

export async function markMykoboCustomerPending(userId: string, email: string): Promise<void> {
  await upsertMykoboCustomer({ email, status: VerificationStatus.Pending, statusExternal: null, userId });
}

export interface ResolvedMykoboCustomer {
  email: string;
}

/**
 * Resolve the Mykobo identity for an EUR ramp from the authenticated user's profile, and require an
 * approved Mykobo KYC status. The Mykobo email is the user's profile email (`profiles.email` is
 * unique and keyed by `userId`); it is never taken from the request body. A client-supplied email
 * is accepted only as a redundant check and MUST match the derived value.
 *
 * Mirrors `resolveAveniaAccountForUser` (BRL) and `resolveAlfredpayCustomerId` (Alfredpay): the
 * sender identity is derived server-side and the corridor's KYC-completion status is enforced
 * before any provider intent is created.
 */
export async function resolveMykoboCustomerForUser(userId: string, providedEmail?: string): Promise<ResolvedMykoboCustomer> {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new APIError({
      message: "No profile found for this user; cannot resolve the Mykobo customer.",
      status: httpStatus.BAD_REQUEST
    });
  }

  const email = user.email;

  if (providedEmail && providedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new APIError({
      message: "Provided email does not match the profile bound to the authenticated user.",
      status: httpStatus.BAD_REQUEST
    });
  }

  // Refresh the KYC mirror from the live Mykobo profile, then gate on an approved customer.
  await syncMykoboCustomerKyc(userId, email);

  const entity = await getOrCreateCustomerEntityForProfile(userId, "individual");
  const customer = await ProviderCustomer.findOne({
    where: { customerEntityId: entity.id, provider: "mykobo" }
  });
  if (!customer || customer.status !== VerificationStatus.Approved) {
    throw new APIError({
      message: "Mykobo KYC is not approved for this user. Complete Mykobo KYC before requesting an EUR ramp.",
      status: httpStatus.BAD_REQUEST
    });
  }

  return { email };
}

export async function syncMykoboCustomerKyc(userId: string, email: string): Promise<void> {
  try {
    const { profile } = await MykoboApiService.getInstance().getProfileByEmail(email);
    await upsertMykoboCustomerFromProfile(userId, email, profile);
  } catch (error) {
    if (error instanceof MykoboApiError && error.status === 404) {
      await upsertMykoboCustomer({
        email,
        status: VerificationStatus.Pending,
        statusExternal: null,
        userId
      });
      return;
    }
    logger.error("Failed to sync Mykobo customer KYC mirror:", error);
  }
}
