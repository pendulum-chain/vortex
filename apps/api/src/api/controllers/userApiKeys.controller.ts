import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import httpStatus from "http-status";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import ApiKey from "../../models/apiKey.model";
import User from "../../models/user.model";
import { digestApiKey, generateApiKey, getKeyPrefix, getSecretKeyLookupPrefix } from "../middlewares/apiKeyAuth.helpers";

interface CreateApiKeyBody {
  expiresAt?: unknown;
  name?: unknown;
}

// Keep the number of active credentials per user bounded for resource hygiene and to
// limit the blast radius of a compromised account.
export const MAX_ACTIVE_KEYS_PER_USER = 10;

// Keys must expire; cap client-supplied expiry at 2 years (default is 1 year).
const MAX_EXPIRY_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

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
    if (name !== undefined && typeof name !== "string") {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_API_KEY_NAME",
          message: "name must be a string",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const baseName = name?.trim() || "API Key";
    if (baseName.length > 91) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_API_KEY_NAME",
          message: "name must be at most 91 characters",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    if (expiresAt !== undefined && (typeof expiresAt !== "string" || !ISO_DATE_TIME_PATTERN.test(expiresAt))) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_EXPIRES_AT",
          message: "expiresAt must be a valid ISO-8601 date",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

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

    if (expirationDate.getTime() <= Date.now()) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_EXPIRES_AT",
          message: "expiresAt must be in the future",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    if (expiresAt && expirationDate.getTime() > Date.now() + MAX_EXPIRY_MS) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_EXPIRES_AT",
          message: "expiresAt must be at most 2 years from now",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const environment = config.sandboxEnabled ? "test" : "live";
    const credentialId = randomUUID();
    const publicKey = generateApiKey("public", environment);
    const publicKeyPrefix = getKeyPrefix(publicKey);
    const secretKey = generateApiKey("secret", environment);
    const secretKeyHash = digestApiKey(secretKey);
    const secretKeyPrefix = getSecretKeyLookupPrefix(secretKey);

    // Lock the profile so concurrent requests for one user cannot both pass the cap check.
    const records = await sequelize.transaction(async transaction => {
      const user = await User.findByPk(userId, { attributes: ["id"], lock: transaction.LOCK.UPDATE, transaction });
      if (!user) throw new Error("Authenticated user profile not found");

      const activeKeyCount = await ApiKey.count({
        transaction,
        where: { isActive: true, partnerId: null, partnerName: null, userId }
      });
      if (activeKeyCount + 2 > MAX_ACTIVE_KEYS_PER_USER) return null;

      const publicKeyRecord = await ApiKey.create(
        {
          credentialId,
          expiresAt: expirationDate,
          isActive: true,
          keyHash: null,
          keyPrefix: publicKeyPrefix,
          keyType: "public",
          keyValue: publicKey,
          name: `${baseName} (Public)`,
          partnerId: null,
          partnerName: null,
          userId
        },
        { transaction }
      );

      const secretKeyRecord = await ApiKey.create(
        {
          credentialId,
          expiresAt: expirationDate,
          isActive: true,
          keyHash: secretKeyHash,
          keyPrefix: secretKeyPrefix,
          keyType: "secret",
          keyValue: null,
          name: `${baseName} (Secret)`,
          partnerId: null,
          partnerName: null,
          userId
        },
        { transaction }
      );

      return { publicKeyRecord, secretKeyRecord };
    });

    if (!records) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "API_KEY_LIMIT_REACHED",
          message: `Active API key limit reached (${MAX_ACTIVE_KEYS_PER_USER} keys). Revoke unused keys before creating new ones.`,
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    const { publicKeyRecord, secretKeyRecord } = records;

    res.status(httpStatus.CREATED).json({
      createdAt: publicKeyRecord.createdAt,
      credentialId,
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
        "credentialId",
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
      where: { isActive: true, partnerId: null, partnerName: null, userId }
    });

    res.status(httpStatus.OK).json({
      apiKeys: apiKeys.map(key => ({
        createdAt: key.createdAt,
        credentialId: key.credentialId,
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

function stripSuffix(name: string): string {
  return name.replace(/\s*\((Public|Secret)\)$/, "");
}

function keyPairBaseName(name: string): string {
  const stripped = stripSuffix(name);
  if (stripped === "Public Key" || stripped === "Secret Key") {
    return "API Key";
  }
  return stripped;
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

  // The paired key may be either the public or secret half — the type check below enforces the
  // pair is one of each. Accept the legacy `publicKeyId` alias for backward compatibility.
  const { pairedKeyId, publicKeyId } = req.body ?? {};
  const otherKeyId = pairedKeyId ?? publicKeyId;

  try {
    const primaryKey = await ApiKey.findOne({
      where: { id: keyId, isActive: true, partnerId: null, partnerName: null, userId }
    });
    if (!primaryKey) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key not found or not owned by the authenticated user",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    if (!otherKeyId) {
      await primaryKey.update({ isActive: false, revokedAt: new Date() });
      res.status(httpStatus.NO_CONTENT).send();
      return;
    }

    const pairedKey = await ApiKey.findOne({
      where: { id: otherKeyId, isActive: true, partnerId: null, partnerName: null, userId }
    });
    if (!pairedKey) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PAIRED_PUBLIC_KEY_NOT_FOUND",
          message: "Paired key not found or not owned by the authenticated user",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    const types = new Set([primaryKey.keyType, pairedKey.keyType]);
    if (!types.has("public") || !types.has("secret")) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "INVALID_KEY_PAIR",
          message:
            "Both keys must be of different types (one public, one secret). A single key can be deleted without pairedKeyId.",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    if ((primaryKey.credentialId || pairedKey.credentialId) && primaryKey.credentialId !== pairedKey.credentialId) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "KEY_PAIR_MISMATCH",
          message: "The selected keys do not belong to the same credential",
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const baseName = keyPairBaseName(primaryKey.name ?? "");
    const pairedBaseName = keyPairBaseName(pairedKey.name ?? "");
    if (!primaryKey.credentialId && primaryKey.name && pairedKey.name && baseName !== pairedBaseName) {
      res.status(httpStatus.BAD_REQUEST).json({
        error: {
          code: "KEY_PAIR_MISMATCH",
          message: `Key names do not match: "${primaryKey.name}" and "${pairedKey.name}" appear to be from different pairs`,
          status: httpStatus.BAD_REQUEST
        }
      });
      return;
    }

    const revokedAt = new Date();
    await sequelize.transaction(async transaction => {
      await primaryKey.update({ isActive: false, revokedAt }, { transaction });
      await pairedKey.update({ isActive: false, revokedAt }, { transaction });
    });
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
