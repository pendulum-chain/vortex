import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import ApiKey from "../../../models/apiKey.model";
import Partner from "../../../models/partner.model";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../../middlewares/apiKeyAuth.helpers";

/**
 * Create a new API key for a partner
 * POST /v1/admin/partners/:partnerId/api-keys
 */
export async function createApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { partnerId } = req.params;
    const { name, expiresAt } = req.body;

    // Verify partner exists and is active
    const partner = await Partner.findOne({
      where: {
        id: partnerId,
        isActive: true
      }
    });

    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: "Partner not found or inactive",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Generate new API key with environment-appropriate prefix
    // 'test' prefix for sandbox, 'live' prefix for production
    const environment = SANDBOX_ENABLED === "true" ? "test" : "live";
    const apiKey = generateApiKey(environment);
    const keyHash = await hashApiKey(apiKey);
    const keyPrefix = getKeyPrefix(apiKey);

    // Create API key record
    const apiKeyRecord = await ApiKey.create({
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      keyHash,
      keyPrefix,
      name: name || null,
      partnerId
    });

    // Return the API key (only time it's ever shown!)
    res.status(httpStatus.CREATED).json({
      apiKey,
      createdAt: apiKeyRecord.createdAt,
      expiresAt: apiKeyRecord.expiresAt, // Full key shown only once!
      id: apiKeyRecord.id,
      isActive: apiKeyRecord.isActive,
      keyPrefix: apiKeyRecord.keyPrefix,
      name: apiKeyRecord.name,
      partnerId: apiKeyRecord.partnerId
    });
  } catch (error) {
    logger.error("Error creating API key:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create API key",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

/**
 * List all API keys for a partner
 * GET /v1/admin/partners/:partnerId/api-keys
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  try {
    const { partnerId } = req.params;

    // Verify partner exists
    const partner = await Partner.findByPk(partnerId);

    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: "Partner not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Get all API keys for this partner
    const apiKeys = await ApiKey.findAll({
      attributes: ["id", "keyPrefix", "name", "lastUsedAt", "expiresAt", "isActive", "createdAt", "updatedAt"],
      order: [["createdAt", "DESC"]],
      where: { partnerId }
    });

    res.status(httpStatus.OK).json({
      apiKeys: apiKeys.map(key => ({
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        id: key.id,
        isActive: key.isActive,
        keyPrefix: key.keyPrefix,
        lastUsedAt: key.lastUsedAt,
        name: key.name,
        updatedAt: key.updatedAt
      }))
    });
  } catch (error) {
    logger.error("Error listing API keys:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list API keys",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

/**
 * Revoke (soft delete) an API key
 * DELETE /v1/admin/partners/:partnerId/api-keys/:keyId
 */
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { partnerId, keyId } = req.params;

    // Find the API key
    const apiKey = await ApiKey.findOne({
      where: {
        id: keyId,
        partnerId
      }
    });

    if (!apiKey) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Soft delete by setting isActive to false
    await apiKey.update({ isActive: false });

    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error revoking API key:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to revoke API key",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
