import { MykoboApiError, MykoboApiService, MykoboCustomerStatus, MykoboProfile, mapMykoboReviewStatus } from "@vortexfi/shared";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import MykoboCustomer from "../../../models/mykoboCustomer.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";

interface UpsertArgs {
  userId: string;
  email: string;
  status: MykoboCustomerStatus;
  statusExternal: string | null;
}

async function upsertMykoboCustomer({ userId, email, status, statusExternal }: UpsertArgs): Promise<void> {
  const existing = await MykoboCustomer.findOne({ where: { userId } });
  if (existing) {
    await existing.update({ email, status, statusExternal });
    return;
  }
  await MykoboCustomer.create({ email, status, statusExternal, userId });
}

export async function upsertMykoboCustomerFromProfile(userId: string, email: string, profile: MykoboProfile): Promise<void> {
  const reviewStatus = profile.kyc_status?.review_status ?? null;
  await upsertMykoboCustomer({
    email,
    status: mapMykoboReviewStatus(reviewStatus),
    statusExternal: reviewStatus,
    userId
  });
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

  const customer = await MykoboCustomer.findOne({ where: { userId } });
  if (!customer || customer.status !== MykoboCustomerStatus.APPROVED) {
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
        status: MykoboCustomerStatus.CONSULTED,
        statusExternal: null,
        userId
      });
      return;
    }
    logger.error("Failed to sync Mykobo customer KYC mirror:", error);
  }
}
