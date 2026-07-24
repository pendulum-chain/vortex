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
 * Digest an API key for storage (secret keys only). SHA-256 of the full key,
 * hex-encoded. The secret part is 32 chars of ~6 bits each (~190 bits of
 * entropy, ~140 bits beyond the lookup prefix), so a slow password hash adds
 * nothing except online-DoS exposure — a single fast digest compared in
 * constant time is the right primitive. Legacy rows still hold bcrypt hashes
 * (recognizable by their `$2` prefix) and are upgraded on first successful use.
 */
export function digestApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2");
}

function digestMatches(apiKey: string, storedDigest: string): boolean {
  const presented = Buffer.from(digestApiKey(apiKey), "hex");
  const stored = Buffer.from(storedDigest, "hex");
  return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
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
 * Lookup prefix for secret keys: the 8-char type/environment prefix plus the
 * first 8 random chars. It acts as a non-secret key identifier — 62^8 values,
 * so an indexed equality lookup returns at most a handful of rows and
 * verification cost no longer grows with the number of active keys in the
 * environment.
 */
export const SECRET_KEY_LOOKUP_PREFIX_LENGTH = 16;

export function getSecretKeyLookupPrefix(key: string): string {
  return key.substring(0, SECRET_KEY_LOOKUP_PREFIX_LENGTH);
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

    // A partner-created key whose partner row was deleted (FK ON DELETE SET NULL) is
    // revoked — it must not degrade into a partnerless public key.
    if (!keyRecord.partnerId && keyRecord.partnerName) {
      return null;
    }

    // Resolve the partner name through the FK; downstream quote resolution looks the
    // partner up by its (unique) name and applies its own is-active filtering.
    let partnerName: string | null = null;
    if (keyRecord.partnerId) {
      const partner = await Partner.findByPk(keyRecord.partnerId);
      if (!partner) {
        return null; // Partner row gone: treat the key as revoked.
      }
      partnerName = partner.name;
    }

    return { partnerName };
  } catch (error) {
    logger.error("Error validating public API key:", error);
    return null;
  }
}

/**
 * Validate secret API key and return associated partner information.
 *
 * New-format rows are found by their 16-char lookup prefix (a non-secret key
 * identifier) and verified with a constant-time SHA-256 digest comparison —
 * O(1) regardless of how many keys are active. Rows created before the lookup
 * prefix existed only stored the 8-char type prefix (constant across every
 * secret key), so when the 16-char lookup finds nothing we fall back to the
 * legacy scan and bcrypt comparison; a legacy row that validates is upgraded
 * in place (16-char prefix + SHA-256 digest, possible because the plaintext is
 * in hand) so it takes the O(1) path from then on.
 *
 * @param apiKey - The secret API key to validate
 * @returns Promise resolving to validation result, or null if invalid
 */
export async function validateSecretApiKey(apiKey: string): Promise<ValidatedSecretKey | null> {
  try {
    let apiKeys = await ApiKey.findAll({
      where: {
        isActive: true,
        keyPrefix: getSecretKeyLookupPrefix(apiKey),
        keyType: "secret"
      }
    });

    let legacyLookup = false;
    if (apiKeys.length === 0) {
      legacyLookup = true;
      apiKeys = await ApiKey.findAll({
        where: {
          isActive: true,
          keyPrefix: getKeyPrefix(apiKey),
          keyType: "secret"
        }
      });
    }

    for (const keyRecord of apiKeys) {
      if (!keyRecord.keyHash) {
        continue; // Skip if no hash (shouldn't happen for secret keys)
      }

      // Legacy rows hold bcrypt hashes; upgraded/new rows hold SHA-256 digests.
      const isMatch = isBcryptHash(keyRecord.keyHash)
        ? await bcrypt.compare(apiKey, keyRecord.keyHash)
        : digestMatches(apiKey, keyRecord.keyHash);

      if (isMatch) {
        if (legacyLookup) {
          // Lazy upgrade; a failed write is harmless — the row simply stays on
          // the legacy path until the next successful validation.
          keyRecord.update({ keyHash: digestApiKey(apiKey), keyPrefix: getSecretKeyLookupPrefix(apiKey) }).catch(err => {
            logger.error("Failed to upgrade legacy API key row to lookup-prefix format:", err);
          });
        }
        // Check expiration
        if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
          continue; // Key expired, try next
        }

        // A partner-created key keeps partner_name even after its partner row is deleted
        // (the FK is ON DELETE SET NULL). It must be rejected, not degraded into a
        // user-scoped key — deleting a partner is key revocation.
        if (!keyRecord.partnerId && keyRecord.partnerName) {
          continue;
        }

        // User-scoped keys (no partner binding at all) authenticate purely as the linked
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
