import { MykoboApiError, MykoboApiService, MykoboCustomerStatus, MykoboProfile, mapMykoboReviewStatus } from "@vortexfi/shared";
import logger from "../../../config/logger";
import MykoboCustomer from "../../../models/mykoboCustomer.model";

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
