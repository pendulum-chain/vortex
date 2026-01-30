import {
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  AlfredpayCreateCustomerRequest,
  AlfredpayCreateCustomerResponse,
  AlfredpayGetKycRedirectLinkRequest,
  AlfredpayGetKycRedirectLinkResponse,
  AlfredpayGetKycStatusRequest,
  AlfredpayGetKycStatusResponse,
  AlfredpayKycRedirectFinishedRequest,
  AlfredpayKycRedirectOpenedRequest,
  AlfredpayStatusRequest,
  AlfredpayStatusResponse
} from "@vortexfi/shared";
import { Request, Response } from "express";
import logger from "../../config/logger";
import AlfredPayCustomer from "../../models/alfredPayCustomer.model";
import { SupabaseAuthService } from "../services/auth/supabase.service";

export class AlfredpayController {
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

  static async createCustomer(req: Request, res: Response) {
    try {
      const { country, type } = req.body as AlfredpayCreateCustomerRequest;
      const userId = req.userId!;

      const user = await SupabaseAuthService.getUserProfile(userId);
      if (!user || !user.email) {
        return res.status(404).json({ error: "User not found or email missing" });
      }

      // Check if customer already exists in our DB
      const existingDbCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, userId }
      });

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      const newCustomer = await alfredpayService.createCustomer(type, country);
      const customerId = newCustomer.customerId;

      await AlfredPayCustomer.create({
        alfredPayId: customerId,
        country: country as AlfredPayCountry,
        email: user.email,
        status: AlfredPayStatus.Consulted,
        type,
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
      const { country } = req.body as AlfredpayKycRedirectOpenedRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
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
      const { country } = req.body as AlfredpayKycRedirectFinishedRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
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
      const { submissionId, country } = req.query as unknown as AlfredpayGetKycStatusRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();
      const statusResponse = await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, submissionId);

      res.json(statusResponse as AlfredpayGetKycStatusResponse);
    } catch (error) {
      logger.error("Error getting KYC status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
