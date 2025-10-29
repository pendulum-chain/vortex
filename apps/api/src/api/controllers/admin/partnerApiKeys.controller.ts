import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import ApiKey from "../../../models/apiKey.model";
import Partner from "../../../models/partner.model";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../../middlewares/apiKeyAuth.helpers";

/**
 * Create a new API key for a partner (by name)
 * POST /v1/admin/partners/:partnerName/api-keys
 */
export async function createApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { partnerName } = req.params;
    const { name, expiresAt } = req.body;

    // Verify at least one partner with this name exists and is active
    const partners = await Partner.findAll({
      where: {
        isActive: true,
        name: partnerName
      }
    });

    if (partners.length === 0) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No active partners found with name: ${partnerName}`,
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

    // Create API key record linked to partner name (applies to all partners with this name)
    const apiKeyRecord = await ApiKey.create({
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
      keyHash,
      keyPrefix,
      name: name || null,
      partnerName
    });

    // Return the API key (only time it's ever shown!)
    res.status(httpStatus.CREATED).json({
      apiKey,
      createdAt: apiKeyRecord.createdAt,
      expiresAt: apiKeyRecord.expiresAt, // How many partner records this key applies to
      id: apiKeyRecord.id, // Full key shown only once!
      isActive: apiKeyRecord.isActive,
      keyPrefix: apiKeyRecord.keyPrefix,
      name: apiKeyRecord.name,
      partnerCount: partners.length,
      partnerName: apiKeyRecord.partnerName
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
 * List all API keys for a partner (by name)
 * GET /v1/admin/partners/:partnerName/api-keys
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  try {
    const { partnerName } = req.params;

    // Verify partner exists
    const partners = await Partner.findAll({
      where: { name: partnerName }
    });

    if (partners.length === 0) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No partners found with name: ${partnerName}`,
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Get all API keys for this partner name
    const apiKeys = await ApiKey.findAll({
      attributes: ["id", "keyPrefix", "name", "lastUsedAt", "expiresAt", "isActive", "createdAt", "updatedAt"],
      order: [["createdAt", "DESC"]],
      where: { partnerName }
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
      })),
      partnerCount: partners.length,
      partnerName
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
 * DELETE /v1/admin/partners/:partnerName/api-keys/:keyId
 */
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { partnerName, keyId } = req.params;

    // Find the API key
    const apiKey = await ApiKey.findOne({
      where: {
        id: keyId,
        partnerName
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
