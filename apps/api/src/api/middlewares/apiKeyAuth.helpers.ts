import bcrypt from "bcrypt";
import crypto from "crypto";
import logger from "../../config/logger";
import ApiKey from "../../models/apiKey.model";
import Partner from "../../models/partner.model";

export interface AuthenticatedPartner {
  id: string;
  name: string;
}

/**
 * Validation result for a secret API key. `partner` may be null for user-scoped
 * keys (created via the self-serve API key endpoints) which have no
 * `partner_id` binding; in that case the request authenticates purely as
 * the linked user via `apiKeyUserId`.
 */
export interface ValidatedSecretKey {
  apiKeyId: string;
  apiKeyUserId: string | null;
  partner: AuthenticatedPartner | null;
}

/**
 * Validation result for a public API key. `partnerName` may be null for
 * user-scoped public keys (no partner binding).
 */
export interface ValidatedPublicKey {
  partnerName: string | null;
}

/**
 * Validate API key format for both public and secret keys
 * Public: pk_(live|test)_[32 alphanumeric chars]
 * Secret: sk_(live|test)_[32 alphanumeric chars]
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^(pk|sk)_(live|test)_[a-zA-Z0-9]{32}$/.test(key);
}

/**
 * Validate secret key format specifically
 */
export function isValidSecretKeyFormat(key: string): boolean {
  return /^sk_(live|test)_[a-zA-Z0-9]{32}$/.test(key);
}

/**
 * Detect if a key is public or secret based on prefix
 */
export function getKeyType(key: string): "public" | "secret" | null {
  if (key.startsWith("pk_")) return "public";
  if (key.startsWith("sk_")) return "secret";
  return null;
}

/**
 * Generate a new API key (public or secret)
 * @param keyType - 'public' or 'secret'
 * @param environment - 'live' or 'test' environment
 * @returns Generated API key string
 */
export function generateApiKey(keyType: "public" | "secret", environment: "live" | "test" = "live"): string {
  const randomPart = crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "")
    .replace(/\//g, "")
    .replace(/=/g, "")
    .substring(0, 32);

  const prefix = keyType === "public" ? "pk" : "sk";
  return `${prefix}_${environment}_${randomPart}`;
}

/**
 * Hash an API key for storage using bcrypt (only for secret keys)
 * @param key - The raw API key to hash
 * @returns Promise resolving to the hashed key
 */
export async function hashApiKey(key: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(key, saltRounds);
}

/**
 * Get key prefix (first 8 characters) for display and lookup
 * @param key - The API key
 * @returns First 8 characters of the key
 */
export function getKeyPrefix(key: string): string {
  // pk_live_ or sk_test_ = 8 chars, pk_test_ or sk_live_ = 8 chars
  return key.substring(0, 8);
}

/**
 * Validate public API key (simple lookup, no hashing)
 * @param apiKey - The public API key to validate
 * @returns Promise resolving to validation result, or null if the key is invalid/expired/inactive
 */
export async function validatePublicApiKey(apiKey: string): Promise<ValidatedPublicKey | null> {
  try {
    const keyRecord = await ApiKey.findOne({
      where: {
        isActive: true,
        keyType: "public",
        keyValue: apiKey
      }
    });

    if (!keyRecord) {
      return null;
    }

    // Check expiration
    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      return null; // Key expired
    }

    // Update last used timestamp (async, don't wait)
    keyRecord.update({ lastUsedAt: new Date() }).catch(err => {
      logger.error("Failed to update lastUsedAt for public key:", err);
    });

    // Resolve the partner name through the FK; downstream quote resolution looks the
    // partner up by its (unique) name and applies its own is-active filtering.
    let partnerName: string | null = null;
    if (keyRecord.partnerId) {
      const partner = await Partner.findByPk(keyRecord.partnerId);
      partnerName = partner?.name ?? null;
    }

    return { partnerName };
  } catch (error) {
    logger.error("Error validating public API key:", error);
    return null;
  }
}

/**
 * Validate secret API key and return associated partner information
 * Uses bcrypt hash comparison for security
 * @param apiKey - The secret API key to validate
 * @returns Promise resolving to validation result, or null if invalid
 */
export async function validateSecretApiKey(apiKey: string): Promise<ValidatedSecretKey | null> {
  try {
    // Extract prefix for quick lookup
    const prefix = getKeyPrefix(apiKey);

    // Find all active secret keys with this prefix
    const apiKeys = await ApiKey.findAll({
      where: {
        isActive: true,
        keyPrefix: prefix,
        keyType: "secret"
      }
    });

    // Check each key's hash using bcrypt
    for (const keyRecord of apiKeys) {
      if (!keyRecord.keyHash) {
        continue; // Skip if no hash (shouldn't happen for secret keys)
      }

      const isMatch = await bcrypt.compare(apiKey, keyRecord.keyHash);

      if (isMatch) {
        // Check expiration
        if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
          continue; // Key expired, try next
        }

        // User-scoped keys (no partner_id) authenticate purely as the linked
        // user; skip the Partner lookup so they remain usable without a partner row.
        if (!keyRecord.partnerId) {
          if (!keyRecord.userId) {
            // Key has no partner and no user binding: unusable.
            continue;
          }

          // Update last used timestamp (async, don't wait)
          keyRecord.update({ lastUsedAt: new Date() }).catch(err => {
            logger.error("Failed to update lastUsedAt for secret key:", err);
          });

          return {
            apiKeyId: keyRecord.id,
            apiKeyUserId: keyRecord.userId,
            partner: null
          };
        }

        // Partner-scoped keys: resolve the partner through the FK
        const partner = await Partner.findOne({
          where: {
            id: keyRecord.partnerId,
            isActive: true
          }
        });

        if (!partner) {
          continue; // Partner missing or inactive
        }

        // Update last used timestamp (async, don't wait)
        keyRecord.update({ lastUsedAt: new Date() }).catch(err => {
          logger.error("Failed to update lastUsedAt for secret key:", err);
        });

        return {
          apiKeyId: keyRecord.id,
          apiKeyUserId: keyRecord.userId,
          partner: {
            id: partner.id,
            name: partner.name
          }
        };
      }
    }

    return null; // No matching key found
  } catch (error) {
    logger.error("Error validating secret API key:", error);
    return null;
  }
}

/**
 * Unified validation function that detects key type and validates accordingly
 * @param apiKey - The API key to validate (public or secret)
 * @returns Promise resolving to validation result for secret keys, or null for public/invalid keys
 */
export async function validateApiKey(apiKey: string): Promise<ValidatedSecretKey | null> {
  const keyType = getKeyType(apiKey);

  if (keyType === "secret") {
    return validateSecretApiKey(apiKey);
  }

  if (keyType === "public") {
    // Public keys don't provide authentication, just validation
    // Return null to indicate no authentication
    return null;
  }

  return null; // Invalid key format
}
