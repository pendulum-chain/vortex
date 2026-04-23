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
import logger from "../../config/logger";
import AlfredPayCustomer from "../../models/alfredPayCustomer.model";

export class AlfredpayController {
  private static mapKycStatus(status: AlfredpayKycStatus): AlfredPayStatus | null {
    switch (status) {
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
        return null; // Do nothing
    }
  }

  static async alfredpayStatus(req: Request, res: Response) {
    try {
      const { country } = req.query as unknown as AlfredpayStatusRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      try {
        const lastSubmission = await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);

        if (lastSubmission && lastSubmission.submissionId) {
          const statusResponse = await alfredpayService.getKycStatus(
            alfredPayCustomer.alfredPayId,
            lastSubmission.submissionId
          );

          const newStatus = AlfredpayController.mapKycStatus(statusResponse.status);
          const updateData: Partial<AlfredPayCustomer> = {};

          if (newStatus && newStatus !== alfredPayCustomer.status) {
            updateData.status = newStatus;
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
        const errorMessage = ((error as any)?.message || (error as any)?.toString() || "").toLowerCase();
        if (errorMessage.includes("404") || errorMessage.includes("not found")) {
          if (alfredPayCustomer.status === AlfredPayStatus.Success) {
            logger.info("Resetting stale AlfredPay status to Consulted due to upstream 404");
            await alfredPayCustomer.update({ status: AlfredPayStatus.Consulted });
          }
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
      const userId = req.userId!;
      const userEmail = req.userEmail;

      if (!userEmail) {
        return res.status(400).json({ error: "User email not available" });
      }

      // Check if customer already exists in our DB
      const existingDbCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, userId }
      });

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      const newCustomer = await alfredpayService.createCustomer(userEmail, AlfredpayCustomerType.INDIVIDUAL, country);
      const customerId = newCustomer.customerId;

      await AlfredPayCustomer.create({
        alfredPayId: customerId,
        country: country as AlfredPayCountry,
        status: AlfredPayStatus.Consulted,
        type: AlfredpayCustomerType.INDIVIDUAL,
        userId
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
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, userId }
      });

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
          if (statusRes.status === "COMPLETED" || statusRes.status === "IN_REVIEW") {
            return res.status(400).json({ error: `KYC is in status ${statusRes.status}` });
          }
        }
      } catch (e) {
        logger.info("No previous KYC submission found or error fetching it, proceeding.");
      }

      const linkResponse = await alfredpayService.getKycRedirectLink(alfredPayCustomer.alfredPayId, country);

      res.json(linkResponse as AlfredpayGetKycRedirectLinkResponse);
    } catch (error) {
      logger.error("Error getting KYC redirect link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async kycRedirectOpened(req: Request, res: Response) {
    try {
      const { country, type } = req.body as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = req.userId!;
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, type: selectedType, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      await alfredPayCustomer.update({ status: AlfredPayStatus.LinkOpened });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking KYC redirect opened:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async kycRedirectFinished(req: Request, res: Response) {
    try {
      const { country, type } = req.body as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = req.userId!;
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, type: selectedType, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      await alfredPayCustomer.update({ status: AlfredPayStatus.UserCompleted });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking KYC redirect finished:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getKycStatus(req: Request, res: Response) {
    try {
      const { country, type } = req.query as unknown as { country: string; type?: AlfredpayCustomerType };
      const userId = req.userId!;
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, type: selectedType, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const isBusiness = selectedType === AlfredpayCustomerType.BUSINESS;

      const lastSubmission = isBusiness
        ? await alfredpayService.getLastKybSubmission(alfredPayCustomer.alfredPayId)
        : await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);

      if (!lastSubmission || !lastSubmission.submissionId) {
        return res.status(404).json({ error: "No KYC attempt found" });
      }

      const statusResponse = isBusiness
        ? await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId)
        : await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);

      const newStatus = AlfredpayController.mapKycStatus(statusResponse.status);
      const updateData: Partial<AlfredPayCustomer> = {};

      if (newStatus && newStatus !== alfredPayCustomer.status) {
        updateData.status = newStatus;
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
      const userId = req.userId!;
      const selectedType = type || AlfredpayCustomerType.INDIVIDUAL;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, type: selectedType, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const isBusiness = selectedType === AlfredpayCustomerType.BUSINESS;

      const lastSubmission = isBusiness
        ? await alfredpayService.getLastKybSubmission(alfredPayCustomer.alfredPayId)
        : await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);

      if (!lastSubmission || !lastSubmission.submissionId) {
        return res.status(400).json({ error: "No KYC submission found to retry" });
      }

      const statusRes = isBusiness
        ? await alfredpayService.getKybStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId)
        : await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);

      if (statusRes.status !== AlfredpayKycStatus.FAILED) {
        return res.status(400).json({ error: `Cannot retry KYC. Current status is ${statusRes.status}` });
      }

      if (isBusiness) {
        await alfredpayService.retryKybSubmission(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);
        const linkResponse = await alfredpayService.getKybRedirectLink(alfredPayCustomer.alfredPayId);
        await alfredPayCustomer.update({ status: AlfredPayStatus.Consulted });
        return res.json(linkResponse as AlfredpayGetKybRedirectLinkResponse);
      } else if (country === "MX" || country === "CO") {
        // MX/CO use API-based (form) KYC — no redirect link needed.
        // Just reset status so the user can re-fill the form.
        await alfredPayCustomer.update({ status: AlfredPayStatus.Consulted });
        return res.json({ success: true });
      } else {
        await alfredpayService.retryKycSubmission(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);
        const linkResponse = await alfredpayService.getKycRedirectLink(alfredPayCustomer.alfredPayId, country);
        await alfredPayCustomer.update({ status: AlfredPayStatus.Consulted });
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
      const userId = req.userId!;
      const userEmail = req.userEmail;

      if (!userEmail) {
        return res.status(400).json({ error: "User email not available" });
      }

      const type = AlfredpayCustomerType.BUSINESS;

      const existingDbCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type, userId }
      });

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Business customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      const newCustomer = await alfredpayService.createCustomer(userEmail, type, country);
      const customerId = newCustomer.customerId;

      await AlfredPayCustomer.create({
        alfredPayId: customerId,
        country: country as AlfredPayCountry,
        status: AlfredPayStatus.Consulted,
        type,
        userId
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
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.BUSINESS, userId }
      });

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
          if (statusRes.status === AlfredpayKybStatus.COMPLETED || statusRes.status === AlfredpayKybStatus.IN_REVIEW) {
            return res.status(400).json({ error: `KYB is in status ${statusRes.status}` });
          }
        }
      } catch (e) {
        logger.info("No previous KYB submission found or error fetching it, proceeding.");
      }

      const linkResponse = await alfredpayService.getKybRedirectLink(alfredPayCustomer.alfredPayId);

      res.json(linkResponse as AlfredpayGetKybRedirectLinkResponse);
    } catch (error) {
      logger.error("Error getting KYB redirect link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async submitKycInformation(req: Request, res: Response) {
    try {
      const { country, ...kycData } = req.body as SubmitKycInformationRequest & { country: string };
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.INDIVIDUAL, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const result = await alfredpayService.submitKycInformation(alfredPayCustomer.alfredPayId, { ...kycData, country });

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
      const userId = req.userId!;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.INDIVIDUAL, userId }
      });

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
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.INDIVIDUAL, userId }
      });

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
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.BUSINESS, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const result = await alfredpayService.submitKybInformation(alfredPayCustomer.alfredPayId, { ...kybData, country });

      res.json(result);
    } catch (error) {
      logger.error("Error submitting KYB information:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async submitKybFile(req: Request, res: Response) {
    try {
      const { country, submissionId, fileType } = req.body as { country: string; submissionId: string; fileType: string };
      const userId = req.userId!;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.BUSINESS, userId }
      });

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
    try {
      const { country, relatedPersonId, fileType } = req.body as {
        country: string;
        relatedPersonId: string;
        fileType: string;
      };
      const userId = req.userId!;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.BUSINESS, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay business customer not found" });
      }

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
      logger.error("Error submitting KYB related person file:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ error: message });
    }
  }

  static async sendKybSubmission(req: Request, res: Response) {
    try {
      const { country, submissionId } = req.body as { country: string; submissionId: string };
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, type: AlfredpayCustomerType.BUSINESS, userId }
      });

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
        accountAlias,
        routingNumber,
        networkIdentifier
      } = req.body as AlfredpayAddFiatAccountRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const result = await alfredpayService.createFiatAccount(alfredPayCustomer.alfredPayId, type as AlfredpayFiatAccountType, {
        accountAlias: accountAlias ?? "",
        accountBankCode,
        accountName,
        accountNumber,
        accountType: accountType ?? "",
        networkIdentifier: networkIdentifier ?? "",
        routingNumber
      });

      res.json(result);
    } catch (error) {
      logger.error("Error adding fiat account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async listFiatAccounts(req: Request, res: Response) {
    try {
      const { country } = req.query as { country: string };
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const accounts = await alfredpayService.listFiatAccounts(alfredPayCustomer.alfredPayId);

      res.json(accounts);
    } catch (error) {
      logger.error("Error listing fiat accounts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteFiatAccount(req: Request, res: Response) {
    try {
      const { fiatAccountId } = req.params as { fiatAccountId: string };
      const { country } = req.query as { country: string };
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      await alfredpayService.deleteFiatAccount(fiatAccountId);

      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting fiat account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
