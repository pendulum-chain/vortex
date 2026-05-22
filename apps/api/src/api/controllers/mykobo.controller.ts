import { MykoboApiError, MykoboApiService, MykoboProfile } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { isAddress } from "viem";
import logger from "../../config/logger";

const PROFILE_TEXT_FIELDS = [
  "first_name",
  "last_name",
  "additional_name",
  "email_address",
  "mobile_number",
  "birth_date",
  "birth_country_code",
  "address_line_1",
  "city",
  "id_country_code",
  "id_type",
  "bank_account_number",
  "bank_number",
  "wallet_address",
  "source_of_funds",
  "tax_country",
  "tax_id",
  "tax_id_name",
  "memo"
] as const;

const PROFILE_FILE_FIELDS = ["front", "back", "face", "utility_bill"] as const;

const toFrontendProfile = (p: MykoboProfile) => ({
  bankAccountNumber: p.bank_account_number,
  createdAt: p.created_at,
  emailAddress: p.email_address,
  firstName: p.first_name,
  kycStatus: {
    receivedAt: p.kyc_status.received_at,
    reviewStatus: p.kyc_status.review_status
  },
  lastName: p.last_name
});

const emailsMatch = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export const getProfileController = async (req: Request, res: Response): Promise<void> => {
  const { address, memo } = req.query;
  const userEmail = req.userEmail;

  if (!userEmail) {
    res.status(httpStatus.UNAUTHORIZED).json({ error: "Authenticated user email missing" });
    return;
  }
  if (!address || typeof address !== "string" || !isAddress(address)) {
    res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid address parameter" });
    return;
  }

  try {
    const memoParam = typeof memo === "string" && memo.length > 0 ? memo : undefined;
    const { profile } = await MykoboApiService.getInstance().getProfileByWalletAddress(address, memoParam);
    if (!emailsMatch(profile.email_address, userEmail)) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Profile not found" });
      return;
    }
    res.json({ profile: toFrontendProfile(profile) });
  } catch (error) {
    if (error instanceof MykoboApiError && error.status === 404) {
      res.status(httpStatus.NOT_FOUND).json({ error: "Profile not found" });
      return;
    }
    logger.error("Error in getProfileController:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

export const createProfileController = async (req: Request, res: Response): Promise<void> => {
  const userEmail = req.userEmail;
  if (!userEmail) {
    res.status(httpStatus.UNAUTHORIZED).json({ error: "Authenticated user email missing" });
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const walletAddress = body.wallet_address;
    if (typeof walletAddress !== "string" || !isAddress(walletAddress)) {
      res.status(httpStatus.BAD_REQUEST).json({ error: "Invalid wallet_address" });
      return;
    }

    const formData = new FormData();
    for (const field of PROFILE_TEXT_FIELDS) {
      if (field === "email_address") continue;
      const value = body[field];
      if (typeof value === "string" && value.length > 0) {
        formData.append(field, value);
      }
    }
    formData.append("email_address", userEmail);

    const files = (req as Request & { files?: Record<string, Express.Multer.File[]> }).files;
    if (files && typeof files === "object") {
      for (const fieldname of PROFILE_FILE_FIELDS) {
        const file = files[fieldname]?.[0];
        if (!file) continue;
        formData.append(fieldname, new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
      }
    }

    const { profile } = await MykoboApiService.getInstance().createProfile(formData);
    res.status(httpStatus.CREATED).json({ profile: toFrontendProfile(profile) });
  } catch (error) {
    if (error instanceof MykoboApiError) {
      logger.warn(`Mykobo /profiles upstream error: status=${error.status}`);
      res.status(error.status).json({ error: "Mykobo profile creation failed" });
      return;
    }
    logger.error("Error in createProfileController:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};
