import bcrypt from "bcrypt";
import crypto from "crypto";
import logger from "../../config/logger";
import ApiKey from "../../models/apiKey.model";
import Partner from "../../models/partner.model";

export interface AuthenticatedPartner {
  id: string;
  name: string;
  discount: number;
}

/**
 * Validate API key format
 * Format: vrtx_(live|test)_[32 alphanumeric chars]
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^vrtx_(live|test)_[a-zA-Z0-9]{32}$/.test(key);
}

/**
 * Generate a new API key
 * @param environment - 'live' or 'test' environment
 * @returns Generated API key string
 */
export function generateApiKey(environment: "live" | "test" = "live"): string {
  const randomPart = crypto
    .randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "")
    .replace(/\//g, "")
    .replace(/=/g, "")
    .substring(0, 32);

  return `vrtx_${environment}_${randomPart}`;
}

/**
 * Hash an API key for storage using bcrypt
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
  return key.substring(0, 8);
}

/**
 * Validate API key and return associated partner information
 * @param apiKey - The API key to validate
 * @returns Promise resolving to authenticated partner or null if invalid
 */
export async function validateApiKey(apiKey: string): Promise<AuthenticatedPartner | null> {
  try {
    // Extract prefix for quick lookup
    const prefix = getKeyPrefix(apiKey);

    // Find all active keys with this prefix
    const apiKeys = await ApiKey.findAll({
      include: [
        {
          as: "partner",
          model: Partner,
          where: { isActive: true }
        }
      ],
      where: {
        isActive: true,
        keyPrefix: prefix
      }
    });

    // Check each key's hash using bcrypt
    for (const keyRecord of apiKeys) {
      const isMatch = await bcrypt.compare(apiKey, keyRecord.keyHash);

      if (isMatch) {
        // Check expiration
        if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
          continue; // Key expired, try next
        }

        // Update last used timestamp (async, don't wait)
        keyRecord.update({ lastUsedAt: new Date() }).catch(err => {
          logger.error("Failed to update lastUsedAt:", err);
        });

        // Return partner info
        return {
          discount: keyRecord.partner.discount,
          id: keyRecord.partner.id,
          name: keyRecord.partner.name
        };
      }
    }

    return null; // No matching key found
  } catch (error) {
    logger.error("Error validating API key:", error);
    return null;
  }
}
