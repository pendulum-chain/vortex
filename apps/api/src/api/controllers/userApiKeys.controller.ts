import { Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import ApiKey from "../../models/apiKey.model";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../middlewares/apiKeyAuth.helpers";

interface CreateApiKeyBody {
  expiresAt?: string;
  name?: string;
}

export async function createUserApiKey(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required to create API keys",
        status: httpStatus.UNAUTHORIZED
      }
    });
    return;
  }

  const { name, expiresAt } = (req.body ?? {}) as CreateApiKeyBody;

  try {
    const environment = config.sandboxEnabled ? "test" : "live";

    const publicKey = generateApiKey("public", environment);
    const publicKeyPrefix = getKeyPrefix(publicKey);

    const secretKey = generateApiKey("secret", environment);
    const secretKeyHash = await hashApiKey(secretKey);
    const secretKeyPrefix = getKeyPrefix(secretKey);

    const expirationDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

    if (expiresAt && Number.isNaN(expirationDate.getTime())) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_EXPIRES_AT",
          message: "expiresAt must be a valid ISO-8601 date",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const publicKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: null,
      keyPrefix: publicKeyPrefix,
      keyType: "public",
      keyValue: publicKey,
      name: name ? `${name} (Public)` : "Public Key",
      partnerName: null,
      userId
    });

    const secretKeyRecord = await ApiKey.create({
      expiresAt: expirationDate,
      isActive: true,
      keyHash: secretKeyHash,
      keyPrefix: secretKeyPrefix,
      keyType: "secret",
      keyValue: null,
      name: name ? `${name} (Secret)` : "Secret Key",
      partnerName: null,
      userId
    });

    res.status(httpStatus.CREATED).json({
      createdAt: publicKeyRecord.createdAt,
      expiresAt: expirationDate,
      isActive: true,
      publicKey: {
        id: publicKeyRecord.id,
        key: publicKey,
        keyPrefix: publicKeyRecord.keyPrefix,
        name: publicKeyRecord.name,
        type: "public"
      },
      secretKey: {
        id: secretKeyRecord.id,
        key: secretKey,
        keyPrefix: secretKeyRecord.keyPrefix,
        name: secretKeyRecord.name,
        type: "secret"
      }
    });
  } catch (error) {
    logger.error("Error creating user API keys:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create API keys",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function listUserApiKeys(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required to list API keys",
        status: httpStatus.UNAUTHORIZED
      }
    });
    return;
  }

  try {
    const apiKeys = await ApiKey.findAll({
      attributes: [
        "id",
        "keyType",
        "keyPrefix",
        "keyValue",
        "name",
        "lastUsedAt",
        "expiresAt",
        "isActive",
        "createdAt",
        "updatedAt"
      ],
      order: [["createdAt", "DESC"]],
      where: { isActive: true, userId }
    });

    res.status(httpStatus.OK).json({
      apiKeys: apiKeys.map(key => ({
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        id: key.id,
        isActive: key.isActive,
        key: key.keyType === "public" ? key.keyValue : undefined,
        keyPrefix: key.keyPrefix,
        lastUsedAt: key.lastUsedAt,
        name: key.name,
        type: key.keyType,
        updatedAt: key.updatedAt
      }))
    });
  } catch (error) {
    logger.error("Error listing user API keys:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list API keys",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function revokeUserApiKey(req: Request<{ keyId: string }>, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(httpStatus.UNAUTHORIZED).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required to revoke API keys",
        status: httpStatus.UNAUTHORIZED
      }
    });
    return;
  }

  const keyId = req.params.keyId;
  if (!keyId) {
    res.status(httpStatus.BAD_REQUEST).json({
      error: {
        code: "KEY_ID_REQUIRED",
        message: "keyId path parameter is required",
        status: httpStatus.BAD_REQUEST
      }
    });
    return;
  }

  try {
    const apiKey = await ApiKey.findOne({ where: { id: keyId, isActive: true, userId } });

    if (!apiKey) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key not found or not owned by the authenticated user",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    await apiKey.update({ isActive: false });
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error revoking user API key:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to revoke API key",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
