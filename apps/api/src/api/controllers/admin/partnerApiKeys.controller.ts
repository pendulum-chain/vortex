import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { SANDBOX_ENABLED } from "../../../constants/constants";
import ApiKey from "../../../models/apiKey.model";
import Partner from "../../../models/partner.model";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../../middlewares/apiKeyAuth.helpers";

/**
 * Create a new API key pair (public + secret) for a partner
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

    // Determine environment
    const environment = SANDBOX_ENABLED === "true" ? "test" : "live";

    // Generate public key (pk_live_* or pk_test_*)
    const publicKey = generateApiKey("public", environment);
    const publicKeyPrefix = getKeyPrefix(publicKey);

    // Generate secret key (sk_live_* or sk_test_*)
    const secretKey = generateApiKey("secret", environment);
    const secretKeyHash = await hashApiKey(secretKey);
    const secretKeyPrefix = getKeyPrefix(secretKey);

    const expirationDate = expiresAt ? new Date(expiresAt) : null;

    // Create public key record
    const publicKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: null, // Store plaintext for public keys
      keyPrefix: publicKeyPrefix,
      keyType: "public",
      keyValue: publicKey,
      name: name ? `${name} (Public)` : "Public Key",
      partnerName
    });

    // Create secret key record
    const secretKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: secretKeyHash, // Don't store plaintext for secret keys
      keyPrefix: secretKeyPrefix, // Store hash for secret keys
      keyType: "secret",
      keyValue: null,
      name: name ? `${name} (Secret)` : "Secret Key",
      partnerName
    });

    // Return both keys (secret shown only once!)
    res.status(httpStatus.CREATED).json({
      createdAt: publicKeyRecord.createdAt,
      expiresAt: expirationDate,
      isActive: true,
      partnerCount: partners.length,
      partnerName: partnerName,
      publicKey: {
        id: publicKeyRecord.id,
        key: publicKey, // Can be shown anytime (it's public)
        keyPrefix: publicKeyRecord.keyPrefix,
        name: publicKeyRecord.name,
        type: "public"
      },
      secretKey: {
        id: secretKeyRecord.id,
        key: secretKey, // Shown only once!
        keyPrefix: secretKeyRecord.keyPrefix,
        name: secretKeyRecord.name,
        type: "secret"
      }
    });
  } catch (error) {
    logger.error("Error creating API keys:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create API keys",
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
      attributes: [
        "id",
        "keyType",
        "keyPrefix",
        "keyValue", // Include for public keys
        "name",
        "lastUsedAt",
        "expiresAt",
        "isActive",
        "createdAt",
        "updatedAt"
      ],
      order: [["createdAt", "DESC"]],
      where: { partnerName }
    });

    res.status(httpStatus.OK).json({
      apiKeys: apiKeys.map(key => ({
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        id: key.id,
        isActive: key.isActive, // Show full public key
        key: key.keyType === "public" ? key.keyValue : undefined,
        keyPrefix: key.keyPrefix,
        lastUsedAt: key.lastUsedAt,
        name: key.name,
        type: key.keyType,
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
