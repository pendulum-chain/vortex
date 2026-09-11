import type { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { claimPartnerAttribution } from "../services/partners/partner-attribution.service";

/**
 * Claims partner pricing attribution for the authenticated profile from a validated public
 * API key. The partner is resolved server-side from the credential's `partner_id`; the
 * client only presents the key, so it cannot choose an arbitrary partner. Idempotent:
 * a profile with an active assignment keeps it.
 */
export async function postPartnerAttributionClaim(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required", status: httpStatus.UNAUTHORIZED }
    });
    return;
  }

  // validatePublicKey() is a no-op without a key; the claim is meaningless without one.
  const credential = req.credential;
  if (!credential) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "MISSING_PUBLIC_KEY",
        message: "A public API key (x-public-key header or apiKey body field) is required",
        status: httpStatus.BAD_REQUEST
      }
    });
    return;
  }

  if (!credential.partnerId) {
    res.status(httpStatus.OK).json({ outcome: "no_partner_attribution" });
    return;
  }

  try {
    const outcome = await claimPartnerAttribution(userId, credential.partnerId);
    res.status(httpStatus.OK).json({ outcome });
  } catch (error) {
    logger.error("Error claiming partner attribution", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to claim partner attribution",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
