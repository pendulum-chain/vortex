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
  AlfredpayKycStatus,
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

      // const user = await SupabaseAuthService.getUserProfile(userId);
      // if (!user || !user.email) {
      //   return res.status(404).json({ error: "User not found or email missing" });
      // }
      const user = {
        email: "gianni3@gmail.com"
      };

      // Check if customer already exists in our DB
      const existingDbCustomer = await AlfredPayCustomer.findOne({
        where: { country: country as AlfredPayCountry, userId }
      });

      if (existingDbCustomer) {
        return res.status(400).json({ error: "Customer already exists" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      const newCustomer = await alfredpayService.createCustomer(user.email, type, country);
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

      const linkResponse = await alfredpayService.getKycRedirectLink(alfredPayCustomer.alfredPayId, "MEX");

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
      const { country } = req.query as unknown as AlfredpayGetKycStatusRequest;
      const userId = req.userId!;

      const alfredPayCustomer = await AlfredPayCustomer.findOne({
        order: [["updatedAt", "DESC"]],
        where: { country: country as AlfredPayCountry, userId }
      });

      if (!alfredPayCustomer) {
        return res.status(404).json({ error: "Alfredpay customer not found" });
      }

      const alfredpayService = AlfredpayApiService.getInstance();

      const lastSubmission = await alfredpayService.getLastKycSubmission(alfredPayCustomer.alfredPayId);

      if (!lastSubmission || !lastSubmission.submissionId) {
        return res.status(404).json({ error: "No KYC attempt found" });
      }

      const statusResponse = await alfredpayService.getKycStatus(alfredPayCustomer.alfredPayId, lastSubmission.submissionId);

      const newStatus = AlfredpayController.mapKycStatus(statusResponse.status);
      console.log("newStatus", newStatus);
      const updateData: Partial<AlfredPayCustomer> = {};

      console.log("our status", alfredPayCustomer.status);
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
        email: alfredPayCustomer.email,
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

  private static mapKycStatus(status: AlfredpayKycStatus): AlfredPayStatus | null {
    switch (status) {
      case AlfredpayKycStatus.IN_REVIEW:
        return AlfredPayStatus.Verifying;
      case AlfredpayKycStatus.FAILED:
        return AlfredPayStatus.Failed;
      case AlfredpayKycStatus.COMPLETED:
        return AlfredPayStatus.Success;
      case AlfredpayKycStatus.CREATED:
      default:
        return null; // Do nothing
      // TODO how do we map their UPDATE_REQUIRED required? what does it mean in terms of flow, for our user?
    }
  }
}
