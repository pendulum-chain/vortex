import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ApiKey from "../../../models/apiKey.model";
import Partner from "../../../models/partner.model";
import User from "../../../models/user.model";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../../middlewares/apiKeyAuth.helpers";

/**
 * Create a new API key pair (public + secret) for a partner
 * POST /v1/admin/partners/:partnerName/api-keys
 */
export async function createApiKey(req: Request<{ partnerName: string }>, res: Response): Promise<void> {
  try {
    const partnerName = req.params.partnerName;
    const { name, expiresAt, userId } = req.body;

    // Resolve the (unique-name) partner; keys bind to it by FK
    const partner = await Partner.findOne({
      where: {
        isActive: true,
        name: partnerName
      }
    });

    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No active partners found with name: ${partnerName}`,
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Optionally bind the new key pair to a profile (api_keys.user_id).
    // The user must already exist; null is the default for partner-only keys.
    let resolvedUserId: string | null = null;
    if (userId !== undefined && userId !== null && userId !== "") {
      if (typeof userId !== "string") {
        res.status(httpStatus.BAD_REQUEST).json({
          error: {
            code: "INVALID_USER_ID",
            message: "userId must be a string",
            status: httpStatus.BAD_REQUEST
          }
        });
        return;
      }
      const user = await User.findByPk(userId);
      if (!user) {
        res.status(httpStatus.NOT_FOUND).json({
          error: {
            code: "USER_NOT_FOUND",
            message: "Profile was not found",
            status: httpStatus.NOT_FOUND
          }
        });
        return;
      }
      resolvedUserId = user.id;
    }

    // Determine environment
    const environment = config.sandboxEnabled ? "test" : "live";

    // Generate public key (pk_live_* or pk_test_*)
    const publicKey = generateApiKey("public", environment);
    const publicKeyPrefix = getKeyPrefix(publicKey);

    // Generate secret key (sk_live_* or sk_test_*)
    const secretKey = generateApiKey("secret", environment);
    const secretKeyHash = await hashApiKey(secretKey);
    const secretKeyPrefix = getKeyPrefix(secretKey);

    const expirationDate = expiresAt ? new Date(expiresAt) : null;

    // Create public key record (partner_name kept as informational backup; auth resolves partner_id)
    const publicKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: null, // Store plaintext for public keys
      keyPrefix: publicKeyPrefix,
      keyType: "public",
      keyValue: publicKey,
      name: name ? `${name} (Public)` : "Public Key",
      partnerId: partner.id,
      partnerName,
      userId: resolvedUserId
    });

    // Create secret key record
    const secretKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: secretKeyHash, // Don't store plaintext for secret keys
      keyPrefix: secretKeyPrefix,
      keyType: "secret",
      keyValue: null,
      name: name ? `${name} (Secret)` : "Secret Key",
      partnerId: partner.id,
      partnerName,
      userId: resolvedUserId
    });

    // Return both keys (secret shown only once!)
    res.status(httpStatus.CREATED).json({
      createdAt: publicKeyRecord.createdAt,
      expiresAt: expirationDate,
      isActive: true,
      partnerId: partner.id,
      partnerName,
      publicKey: {
        id: publicKeyRecord.id,
        key: publicKey, // Can be shown anytime (it's public)
        keyPrefix: publicKeyRecord.keyPrefix,
        name: publicKeyRecord.name,
        type: "public",
        userId: publicKeyRecord.userId
      },
      secretKey: {
        id: secretKeyRecord.id,
        key: secretKey, // Shown only once!
        keyPrefix: secretKeyRecord.keyPrefix,
        name: secretKeyRecord.name,
        type: "secret",
        userId: secretKeyRecord.userId
      },
      userId: resolvedUserId
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
export async function listApiKeys(req: Request<{ partnerName: string }>, res: Response): Promise<void> {
  try {
    const partnerName = req.params.partnerName;

    // Verify partner exists
    const partner = await Partner.findOne({
      where: { name: partnerName }
    });

    if (!partner) {
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
        "userId",
        "createdAt",
        "updatedAt"
      ],
      order: [["createdAt", "DESC"]],
      where: { partnerId: partner.id }
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
        updatedAt: key.updatedAt,
        userId: key.userId
      })),
      partnerId: partner.id,
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
export async function revokeApiKey(req: Request<{ partnerName: string; keyId: string }>, res: Response): Promise<void> {
  try {
    const { partnerName, keyId } = req.params;

    const partner = await Partner.findOne({ where: { name: partnerName } });
    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No partners found with name: ${partnerName}`,
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // Find the API key
    const apiKey = await ApiKey.findOne({
      where: {
        id: keyId,
        partnerId: partner.id
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
    await apiKey.update({ isActive: false, revokedAt: new Date() });

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
