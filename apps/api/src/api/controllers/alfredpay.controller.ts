import {
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredpayAddFiatAccountRequest,
  AlfredpayApiService,
  AlfredpayCreateCustomerRequest,
  AlfredpayCreateCustomerResponse,
  AlfredpayCustomerType,
  AlfredpayFiatAccountType,
  AlfredpayGetKybRedirectLinkResponse,
  AlfredpayGetKycRedirectLinkRequest,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusResponse,
  AlfredpayKybFileType,
  AlfredpayKybRelatedPersonFileType,
  AlfredpayKybStatus,
  AlfredpayKycFileType,
  AlfredpayKycStatus,
  AlfredpayStatusRequest,
  AlfredpayStatusResponse,
  SubmitKybInformationRequest,
  SubmitKycInformationRequest
} from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { VerificationStatus } from "../../models/providerCustomer.model";
import { getEffectiveUserId } from "../middlewares/effectiveUser";
import {
  createAlfredpayCustomer,
  findAlfredpayCustomer,
  normalizeAlfredpayProviderStatus,
  resolveAlfredpayKybSubmissionId
} from "../services/alfredpay/alfredpay-customer.service";
import { ALFREDPAY_EFFECTIVE_USER_REQUIRED_MESSAGE } from "../services/quote/alfredpay-customer";

export class AlfredpayController {
  private static getRequiredUserId(req: Request): string {
    if (!req.userId) {
      throw new Error("Authenticated user id not available");
    }

    return req.userId;
  }

  private static getFiatAccountUserId(req: Request): string {
    const userId = getEffectiveUserId(req);
    if (!userId) {
      throw new Error(ALFREDPAY_EFFECTIVE_USER_REQUIRED_MESSAGE);
    }
    return userId;
  }

  private static handleFiatAccountError(operation: string, error: unknown, res: Response) {
    logger.error(`Error ${operation} fiat account:`, error);
    if (error instanceof Error && error.message === ALFREDPAY_EFFECTIVE_USER_REQUIRED_MESSAGE) {
      return res.status(httpStatus.BAD_REQUEST).json({
        error: "This endpoint requires an API key linked to a user or Supabase user authentication."
      });
    }
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Internal server error" });
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private static mapKycStatus(status: AlfredpayKycStatus): AlfredPayStatus | null {
    switch (normalizeAlfredpayProviderStatus(status)) {
      case AlfredpayKycStatus.IN_REVIEW:
        return AlfredPayStatus.Verifying;
      case AlfredpayKycStatus.FAILED:
        return AlfredPayStatus.Failed;
      case AlfredpayKycStatus.COMPLETED:
        return AlfredPayStatus.Success;
      case AlfredpayKycStatus.UPDATE_REQUIRED:
        return AlfredPayStatus.UpdateRequired;
      case AlfredpayKycStatus.CREATED:
      default:
        return null;
    }
  }

  private static mapKybStatus(status: AlfredpayKybStatus): AlfredPayStatus | null {
    switch (normalizeAlfredpayProviderStatus(status)) {
      case AlfredpayKybStatus.IN_REVIEW:
        return AlfredPayStatus.Verifying;
      case AlfredpayKybStatus.FAILED:
        return AlfredPayStatus.Failed;
      case AlfredpayKybStatus.COMPLETED:
        return AlfredPayStatus.Success;
      case AlfredpayKybStatus.UPDATE_REQUIRED:
        return AlfredPayStatus.UpdateRequired;
      case AlfredpayKybStatus.CREATED:
      default:
        return null;
    }
  }

  static async alfredpayStatus(req: Request, res: Response) {
    try {
      const { country } = req.query as unknown as AlfredpayStatusRequest;
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const isBusiness = alfredPayCustomer.type === AlfredpayCustomerType.BUSINESS;

      try {
        const submissionId = isBusiness
          ? await resolveAlfredpayKybSubmissionId(alfredPayCustomer.alfredPayId)
          : (await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId))?.submissionId;

        if (submissionId) {
          const statusResponse = isBusiness
            ? await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, submissionId)
            : await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, submissionId);

          const newStatus = isBusiness
            ? AlfredpayController.mapKybStatus(statusResponse.status)
            : AlfredpayController.mapKycStatus(statusResponse.status);
          const updateData: Partial<{
            status: AlfredPayStatus;
            verificationStatus: VerificationStatus;
            statusExternal: string | null;
            lastFailureReasons: string[];
            providerCaseId: string;
          }> = {
            providerCaseId: submissionId,
            statusExternal: normalizeAlfredpayProviderStatus(statusResponse.status)
          };

          if (newStatus && newStatus !== alfredPayCustomer.status) {
            updateData.status = newStatus;
          }

          // PENDING = unfinalized/invalid submission, not a rejection — reflect it as our Pending.
          if (normalizeAlfredpayProviderStatus(statusResponse.status) === AlfredpayKycStatus.PENDING) {
            updateData.verificationStatus = VerificationStatus.Pending;
          }

          if (newStatus === AlfredPayStatus.Failed && statusResponse.metadata?.failureReason) {
            updateData.lastFailureReasons = [statusResponse.metadata.failureReason];
          }

          if (Object.keys(updateData).length > 0) {
            await alfredPayCustomer.update(updateData);
          }
        }
      } catch (error) {
        logger.error("Error refreshing Alfredpay status:", error);

        // If the upstream API returns 404 (KYC submission not found), the local status is stale.
        // Reset to Consulted so the frontend re-triggers the KYC flow.
        const errorMessage = AlfredpayController.getErrorMessage(error).toLowerCase();
        if (errorMessage.includes("404") || errorMessage.includes("not found")) {
          logger.info("Resetting stale AlfredPay status to pending due to upstream 404");
          await alfredPayCustomer.update({
            status: AlfredPayStatus.Consulted,
            statusExternal: null,
            verificationStatus: VerificationStatus.Pending
          });
        }
      }

      const response: AlfredpayStatusResponse = {
        country: alfredPayCustomer.country,
        creationTime: alfredPayCustomer.createdAt.toISOString(),
        status: alfredPayCustomer.status
      };

      res.json(response);
    } catch (error) {
      logger.error("Error finding Alfredpay customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createIndividualCustomer(req: Request, res: Response) {
    try {
      const { country } = req.body as AlfredpayCreateCustomerRequest;
      const userId = AlfredpayController.getRequiredUserId(req);
      const userEmail = req.userEmail;

      if (!userEmail) {
        return res.status(400).json({ error: "User email not available" });
      }

      // Check if customer already exists in our DB
      const existingDbCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      let customerId: string;
      try {
        const newCustomer = await alfredpayService.createCustomer(userEmail, AlfredpayCustomerType.INDIVIDUAL, country);
        customerId = newCustomer.customerId;
      } catch (error) {
        const errorMessage = (error as Error)?.message || "";
        if (errorMessage.includes("409") || errorMessage.includes("already registered")) {
          logger.info("Customer already exists in Alfredpay, fetching existing customer");
          const existingCustomer = await alfredpayService.findCustomer(userEmail, country);
          customerId = existingCustomer.customerId;
        } else {
          throw error;
        }
      }

      await createAlfredpayCustomer(userId, {
        alfredPayId: customerId,
        country: country as AlfredPayCountry,
        status: AlfredPayStatus.Consulted,
        type: AlfredpayCustomerType.INDIVIDUAL
      });

      const response: AlfredpayCreateCustomerResponse = {
        createdAt: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      logger.error("Error creating Alfredpay customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getKycRedirectLink(req: Request, res: Response) {
    try {
      const { country } = req.query as unknown as AlfredpayGetKycRedirectLinkRequest;
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      if (alfredPayCustomer.status === AlfredPayStatus.Verifying || alfredPayCustomer.status === AlfredPayStatus.Success) {
        return res.status(400).json({ error: "KYC is already verifying or completed" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      try {
        const lastSubmission = await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);
        if (lastSubmission && lastSubmission.submissionId) {
          const statusRes = await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);
          const probeStatus = normalizeAlfredpayProviderStatus(statusRes.status);
          if (probeStatus === AlfredpayKycStatus.COMPLETED || probeStatus === AlfredpayKycStatus.IN_REVIEW) {
            return res.status(400).json({ error: `KYC is in status ${probeStatus}` });
          }
        }
      } catch {
        logger.info("No previous KYC submission found or error fetching it, proceeding.");
      }

      const normalizedCountry = country.toLowerCase() === "us" ? "USA" : country;
      const linkResponse = await alfredpayService.getKycRedirectLink(alfredPayCustomer.alfredPayId, normalizedCountry);

      if (linkResponse.submissionId) {
        await alfredPayCustomer.update({ providerCaseId: linkResponse.submissionId });
      }

      res.json(linkResponse as AlfredpayGetKycRedirectLinkResponse);
    } catch (error) {
      logger.error("Error getting KYC redirect link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async kycRedirectOpened(req: Request, res: Response) {
    try {
      const { country, type } = req.body as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = AlfredpayController.getRequiredUserId(req);
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry, selectedType);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      await alfredPayCustomer.update({ status: AlfredPayStatus.LinkOpened, statusExternal: null });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking KYC redirect opened:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async kycRedirectFinished(req: Request, res: Response) {
    try {
      const { country, type } = req.body as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = AlfredpayController.getRequiredUserId(req);
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry, selectedType);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      await alfredPayCustomer.update({ status: AlfredPayStatus.UserCompleted, statusExternal: null });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking KYC redirect finished:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getKycStatus(req: Request, res: Response) {
    try {
      const { country, type } = req.query as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = AlfredpayController.getRequiredUserId(req);
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry, selectedType);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const isBusiness = selectedType === AlfredpayCustomerType.BUSINESS;

      const submissionId = isBusiness
        ? await resolveAlfredpayKybSubmissionId(alfredPayCustomer.alfredPayId)
        : (await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId))?.submissionId;

      if (!submissionId) {
        await alfredPayCustomer.update({
          status: AlfredPayStatus.Consulted,
          statusExternal: null,
          verificationStatus: VerificationStatus.Pending
        });
        return res.status(404).json({ error: "No KYC attempt found" });
      }

      const statusResponse = isBusiness
        ? await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, submissionId)
        : await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, submissionId);

      const newStatus = isBusiness
        ? AlfredpayController.mapKybStatus(statusResponse.status)
        : AlfredpayController.mapKycStatus(statusResponse.status);
      const updateData: Partial<{
        status: AlfredPayStatus;
        verificationStatus: VerificationStatus;
        statusExternal: string | null;
        lastFailureReasons: string[];
        providerCaseId: string;
      }> = {
        providerCaseId: submissionId,
        statusExternal: normalizeAlfredpayProviderStatus(statusResponse.status)
      };

      if (newStatus && newStatus !== alfredPayCustomer.status) {
        updateData.status = newStatus;
      }

      // PENDING = unfinalized/invalid submission, not a rejection — reflect it as our Pending.
      if (normalizeAlfredpayProviderStatus(statusResponse.status) === AlfredpayKycStatus.PENDING) {
        updateData.verificationStatus = VerificationStatus.Pending;
      }

      if (newStatus === AlfredPayStatus.Failed && statusResponse.metadata?.failureReason) {
        updateData.lastFailureReasons = [statusResponse.metadata.failureReason];
      }

      if (Object.keys(updateData).length > 0) {
        await alfredPayCustomer.update(updateData);
      }

      const response: AlfredpayGetKycStatusResponse = {
        alfred_pay_id: alfredPayCustomer.alfredPayId,
        country: alfredPayCustomer.country,
        lastFailure: updateData.lastFailureReasons?.[0] || alfredPayCustomer.lastFailureReasons?.[0], // Get the latest failure reason
        status: (newStatus || alfredPayCustomer.status) as AlfredPayStatus,
        updated_at: alfredPayCustomer.updatedAt.toISOString()
      };

      res.json(response);
    } catch (error) {
      logger.error("Error getting KYC status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async retryKyc(req: Request, res: Response) {
    try {
      const { country, type } = req.body as { country: string; type?: AlfredpayCustomerType };
      const userId = AlfredpayController.getRequiredUserId(req);
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry, selectedType);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const isBusiness = selectedType === AlfredpayCustomerType.BUSINESS;

      const submissionId = isBusiness
        ? await resolveAlfredpayKybSubmissionId(alfredPayCustomer.alfredPayId)
        : (await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId))?.submissionId;

      if (!submissionId) {
        return res.status(400).json({ error: "No KYC submission found to retry" });
      }

      const statusRes = isBusiness
        ? await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, submissionId)
        : await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, submissionId);

      if (normalizeAlfredpayProviderStatus(statusRes.status) !== AlfredpayKycStatus.FAILED) {
        return res.status(400).json({ error: `Cannot retry KYC. Current status is ${statusRes.status}` });
      }

      if (isBusiness) {
        await alfredpayService.retryKybSubmission(alfredPayCustomer.alfredPayId, submissionId);
        const linkResponse = await alfredpayService.getKybRedirectLink(alfredPayCustomer.alfredPayId);
        await alfredPayCustomer.update({
          status: AlfredPayStatus.Consulted,
          statusExternal: null,
          ...(linkResponse.submissionId ? { providerCaseId: linkResponse.submissionId } : {})
        });
        return res.json(linkResponse as AlfredpayGetKybRedirectLinkResponse);
      } else if (country === "MX" || country === "CO" || country === "AR") {
        // MX/CO use API-based (form) KYC — no redirect link needed.
        // Just reset status so the user can re-fill the form.
        await alfredPayCustomer.update({ status: AlfredPayStatus.Consulted, statusExternal: null });
        return res.json({ success: true });
      } else {
        await alfredpayService.retryKycSubmission(alfredPayCustomer.alfredPayId, submissionId);
        const linkResponse = await alfredpayService.getKycRedirectLink(alfredPayCustomer.alfredPayId, country);
        await alfredPayCustomer.update({
          status: AlfredPayStatus.Consulted,
          statusExternal: null,
          ...(linkResponse.submissionId ? { providerCaseId: linkResponse.submissionId } : {})
        });
        return res.json(linkResponse as AlfredpayGetKycRedirectLinkResponse);
      }
    } catch (error) {
      logger.error("Error retrying KYC:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createBusinessCustomer(req: Request, res: Response) {
    try {
      const { country } = req.body as { country: string };
      const userId = AlfredpayController.getRequiredUserId(req);
      const userEmail = req.userEmail;

      if (!userEmail) {
        return res.status(400).json({ error: "User email not available" });
      }

      const type = AlfredpayCustomerType.BUSINESS;

      const existingDbCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry, type);

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Business customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      let customerId: string;
      try {
        const newCustomer = await alfredpayService.createCustomer(userEmail, type, country);
        customerId = newCustomer.customerId;
      } catch (error) {
        const errorMessage = (error as Error)?.message || "";
        if (errorMessage.includes("409") || errorMessage.includes("already registered")) {
          logger.info("Business customer already exists in Alfredpay, fetching existing customer");
          const existingCustomer = await alfredpayService.findCustomer(userEmail, country);
          customerId = existingCustomer.customerId;
        } else {
          throw error;
        }
      }

      await createAlfredpayCustomer(userId, {
        alfredPayId: customerId,
        country: country as AlfredPayCountry,
        status: AlfredPayStatus.Consulted,
        type
      });

      const response: AlfredpayCreateCustomerResponse = {
        createdAt: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      logger.error("Error creating Alfredpay business customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getKybRedirectLink(req: Request, res: Response) {
    try {
      const { country } = req.query as unknown as AlfredpayGetKycRedirectLinkRequest;
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      if (alfredPayCustomer.status === AlfredPayStatus.Verifying || alfredPayCustomer.status === AlfredPayStatus.Success) {
        return res.status(400).json({ error: "KYB is already verifying or completed" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      try {
        const lastSubmission = await alfredpayService.getLastKybSubmission(alfredPayCustomer.alfredPayId);
        if (lastSubmission && lastSubmission.submissionId) {
          const statusRes = await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);
          const probeStatus = normalizeAlfredpayProviderStatus(statusRes.status);
          if (probeStatus === AlfredpayKybStatus.COMPLETED || probeStatus === AlfredpayKybStatus.IN_REVIEW) {
            return res.status(400).json({ error: `KYB is in status ${probeStatus}` });
          }
        }
      } catch {
        logger.info("No previous KYB submission found or error fetching it, proceeding.");
      }

      const linkResponse = await alfredpayService.getKybRedirectLink(alfredPayCustomer.alfredPayId);

      if (linkResponse.submissionId) {
        await alfredPayCustomer.update({ providerCaseId: linkResponse.submissionId });
      }

      res.json(linkResponse as AlfredpayGetKybRedirectLinkResponse);
    } catch (error) {
      logger.error("Error getting KYB redirect link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async submitKycInformation(req: Request, res: Response) {
    try {
      const { country, ...kycData } = req.body as SubmitKycInformationRequest;
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.INDIVIDUAL
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      let result: Awaited<ReturnType<typeof alfredpayService.submitKycInformation>>;
      try {
        result = await alfredpayService.submitKycInformation(alfredPayCustomer.alfredPayId, { ...kycData, country });
      } catch (error) {
        const errorMessage = (error as Error)?.message || "";
        if (errorMessage.includes("422") && errorMessage.includes("KYC record cannot be retried")) {
          logger.info("KYC record cannot be retried, fetching existing submission");
          const existingSubmission = await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);
          result = { submissionId: existingSubmission.submissionId } as Awaited<
            ReturnType<typeof alfredpayService.submitKycInformation>
          >;
        } else {
          throw error;
        }
      }

      if (result.submissionId) {
        await alfredPayCustomer.update({ providerCaseId: result.submissionId });
      }

      res.json(result);
    } catch (error) {
      logger.error("Error submitting KYC information:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async submitKycFile(req: Request, res: Response) {
    try {
      const { country, submissionId, fileType } = req.body as { country: string; submissionId: string; fileType: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.INDIVIDUAL
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const fileBlob = new File([new Uint8Array(req.file.buffer)], req.file.originalname, { type: req.file.mimetype });
      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.submitKycFile(
        alfredPayCustomer.alfredPayId,
        submissionId,
        fileType as AlfredpayKycFileType,
        fileBlob
      );

      res.json({ success: true });
    } catch (error) {
      logger.error("Error submitting KYC file:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async sendKycSubmission(req: Request, res: Response) {
    try {
      const { country, submissionId } = req.body as { country: string; submissionId: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.INDIVIDUAL
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.sendKycSubmission(alfredPayCustomer.alfredPayId, submissionId);

      res.json({ success: true });
    } catch (error) {
      logger.error("Error sending KYC submission:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async submitKybInformation(req: Request, res: Response) {
    try {
      const { country, ...kybData } = req.body as SubmitKybInformationRequest & { country: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      let result: Awaited<ReturnType<typeof alfredpayService.submitKybInformation>> | undefined;

      // Alfredpay refuses a fresh POST while a submission is still PENDING/CREATED (never finalized
      // or filed with invalid data) — update that submission in place so the flow can resume.
      let pendingSubmissionId: string | undefined;
      try {
        const existingSubmissionId = await resolveAlfredpayKybSubmissionId(alfredPayCustomer.alfredPayId);
        if (existingSubmissionId) {
          const statusRes = await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, existingSubmissionId);
          logger.info(`Existing KYB submission ${existingSubmissionId} has status ${statusRes.status}`);
          const probeStatus = normalizeAlfredpayProviderStatus(statusRes.status);
          if (probeStatus === AlfredpayKybStatus.PENDING || probeStatus === AlfredpayKybStatus.CREATED) {
            pendingSubmissionId = existingSubmissionId;
          } else if (probeStatus === AlfredpayKybStatus.IN_REVIEW || probeStatus === AlfredpayKybStatus.COMPLETED) {
            res.status(httpStatus.CONFLICT).json({ error: `KYB is in status ${probeStatus}` });
            return;
          }
        }
      } catch (error) {
        logger.info(
          `No previous KYB submission found or error probing it, submitting a new one: ${AlfredpayController.getErrorMessage(error)}`
        );
      }
      if (pendingSubmissionId) {
        // Outside the probe's catch: a failing PUT is the user's real error (Alfredpay rejecting the
        // corrected data) — surface it instead of falling through to a fresh POST it refuses anyway.
        await alfredpayService.updateKybInformation(alfredPayCustomer.alfredPayId, pendingSubmissionId, {
          ...kybData,
          country
        });
        result = { submissionId: pendingSubmissionId };
      }

      if (!result) {
        try {
          result = await alfredpayService.submitKybInformation(alfredPayCustomer.alfredPayId, { ...kybData, country });
        } catch (error) {
          const errorMessage = AlfredpayController.getErrorMessage(error);
          const kybAlreadyExists = errorMessage.includes("111405") || errorMessage.includes("Customer KYB already exists");
          const cannotRetry = errorMessage.includes("422") && errorMessage.includes("KYC record cannot be retried");
          if (!kybAlreadyExists && !cannotRetry) {
            throw error;
          }
          const existingSubmissionId = await resolveAlfredpayKybSubmissionId(alfredPayCustomer.alfredPayId);
          if (!existingSubmissionId) {
            throw error;
          }
          if (kybAlreadyExists) {
            const statusRes = await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, existingSubmissionId);
            const providerStatus = normalizeAlfredpayProviderStatus(statusRes.status);
            if (providerStatus !== AlfredpayKybStatus.PENDING && providerStatus !== AlfredpayKybStatus.CREATED) {
              res.status(httpStatus.CONFLICT).json({ error: `KYB is in status ${providerStatus}` });
              return;
            }
            logger.info(`KYB already exists upstream, updating submission ${existingSubmissionId} in place`);
            await alfredpayService.updateKybInformation(alfredPayCustomer.alfredPayId, existingSubmissionId, {
              ...kybData,
              country
            });
          } else {
            logger.info("KYB record cannot be retried, reusing existing submission");
          }
          result = { submissionId: existingSubmissionId };
        }
      }

      if (result.submissionId) {
        await alfredPayCustomer.update({ providerCaseId: result.submissionId });
      }

      res.json(result);
    } catch (error) {
      logger.error("Error submitting KYB information:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async findKybCustomerAndBusiness(req: Request, res: Response) {
    try {
      const { country } = req.query as { country: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const details = await alfredpayService.getKybBusinessDetails(alfredPayCustomer.alfredPayId);

      // submissionId is what lets the caller pick the related persons belonging to the submission it is
      // actually filing — a customer that retried can carry several businesses here.
      const minimized = details.map(business => ({
        relatedPersons: (business.relatedPersons ?? []).map(person => ({ idRelatedPerson: person.idRelatedPerson })),
        submissionId: business.submissionId
      }));

      res.json(minimized);
    } catch (error) {
      logger.error("Error finding Alfredpay KYB customer and business:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async submitKybFile(req: Request, res: Response) {
    try {
      const { country, submissionId, fileType } = req.body as { country: string; submissionId: string; fileType: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      const fileBlob = new File([new Uint8Array(req.file.buffer)], req.file.originalname, { type: req.file.mimetype });
      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.submitKybFiles(
        alfredPayCustomer.alfredPayId,
        submissionId,
        fileType as AlfredpayKybFileType,
        fileBlob
      );

      res.json({ success: true });
    } catch (error) {
      logger.error("Error submitting KYB file:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async submitKybRelatedPersonFile(req: Request, res: Response) {
    let pennyCustomerId: string | undefined;
    try {
      const { country, relatedPersonId, fileType } = req.body as {
        country: string;
        relatedPersonId: string;
        fileType: string;
      };
      const userId = AlfredpayController.getRequiredUserId(req);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      pennyCustomerId = alfredPayCustomer.alfredPayId;

      const fileBlob = new File([new Uint8Array(req.file.buffer)], req.file.originalname, { type: req.file.mimetype });
      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.submitKybRelatedPersonFiles(
        alfredPayCustomer.alfredPayId,
        relatedPersonId,
        fileType as AlfredpayKybRelatedPersonFileType,
        fileBlob
      );

      res.json({ success: true });
    } catch (error) {
      const body = req.body as { country?: string; relatedPersonId?: string; fileType?: string };
      const errSummary = error instanceof Error ? error.message : String(error);
      logger.error(
        `[submitKybRelatedPersonFile] ${errSummary} | customerIdPenny=${pennyCustomerId ?? "n/a"} relatedPersonId=${body.relatedPersonId ?? "n/a"} userId=${req.userId ?? "n/a"}`
      );
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async sendKybSubmission(req: Request, res: Response) {
    try {
      const { country, submissionId } = req.body as { country: string; submissionId: string };
      const userId = AlfredpayController.getRequiredUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(
        userId,
        country as AlfredPayCountry,
        AlfredpayCustomerType.BUSINESS
      );

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.sendKybSubmission(alfredPayCustomer.alfredPayId, submissionId);

      res.json({ success: true });
    } catch (error) {
      logger.error("Error sending KYB submission:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async addFiatAccount(req: Request, res: Response) {
    try {
      const {
        country,
        type,
        accountNumber,
        accountType,
        accountName,
        accountBankCode,
        routingNumber,
        bankStreet,
        bankCity,
        bankState,
        bankCountry,
        bankPostalCode,
        beneficiaryStreet,
        beneficiaryCity,
        beneficiaryState,
        beneficiaryCountry,
        beneficiaryPostalCode,
        documentType,
        documentNumber,
        isExternal = false
      } = req.body as AlfredpayAddFiatAccountRequest;
      const userId = AlfredpayController.getFiatAccountUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayFiatAccountType = type as AlfredpayFiatAccountType;

      let fiatAccountFields;
      if (alfredpayFiatAccountType === AlfredpayFiatAccountType.SPEI) {
        fiatAccountFields = {
          accountNumber,
          accountType: "CLABE",
          metadata: { accountHolderName: accountName }
        };
      } else if (alfredpayFiatAccountType === AlfredpayFiatAccountType.ACH) {
        fiatAccountFields = {
          accountName: accountBankCode,
          accountNumber,
          accountType: accountType ?? "",
          metadata: { accountHolderName: accountName, documentNumber, documentType }
        };
      } else if (alfredpayFiatAccountType === AlfredpayFiatAccountType.COELSA) {
        fiatAccountFields = {
          accountNumber,
          accountType: accountType ?? ""
        };
      } else {
        // BANK_USA — external accounts need address fields inside metadata
        fiatAccountFields = isExternal
          ? {
              accountName: accountBankCode,
              accountNumber,
              accountType: accountType ?? "",
              metadata: {
                bankCity,
                bankCountry,
                bankPostalCode,
                bankState: bankState?.toUpperCase(),
                bankStreet,
                beneficiaryAddress: {
                  city: beneficiaryCity,
                  country: beneficiaryCountry,
                  postalCode: beneficiaryPostalCode,
                  stateProvince: beneficiaryState?.toUpperCase(),
                  street: beneficiaryStreet
                }
              },
              routingNumber
            }
          : {
              accountName: accountBankCode,
              accountNumber,
              accountType: accountType ?? "",
              bankCity,
              bankCountry,
              bankPostalCode,
              bankState: bankState?.toUpperCase(),
              bankStreet,
              routingNumber
            };
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const result = await alfredpayService.createFiatAccount(
        alfredPayCustomer.alfredPayId,
        alfredpayFiatAccountType,
        fiatAccountFields,
        isExternal
      );

      res.json(result);
    } catch (error) {
      AlfredpayController.handleFiatAccountError("adding", error, res);
    }
  }

  static async listFiatAccounts(req: Request, res: Response) {
    try {
      const { country } = req.query as { country: string };
      const userId = AlfredpayController.getFiatAccountUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const accounts = await alfredpayService.listFiatAccounts(alfredPayCustomer.alfredPayId);

      res.json(accounts);
    } catch (error) {
      AlfredpayController.handleFiatAccountError("listing", error, res);
    }
  }

  static async deleteFiatAccount(req: Request, res: Response) {
    try {
      const { fiatAccountId } = req.params as { fiatAccountId: string };
      const { country } = req.query as { country: string };
      const userId = AlfredpayController.getFiatAccountUserId(req);

      const alfredPayCustomer = await findAlfredpayCustomer(userId, country as AlfredPayCountry);

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.deleteFiatAccount(alfredPayCustomer.alfredPayId, fiatAccountId);

      res.status(204).send();
    } catch (error) {
      AlfredpayController.handleFiatAccountError("deleting", error, res);
    }
  }
}
