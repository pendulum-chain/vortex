import crypto from "crypto";

export function isValidApiKeyFormat(key: string): boolean {
  return /^(pk|sk)_(live|test)_[a-zA-Z0-9]{32}$/.test(key);
}

export function isValidSecretKeyFormat(key: string): boolean {
  return /^sk_(live|test)_[a-zA-Z0-9]{32}$/.test(key);
}

export function getKeyType(key: string): "public" | "secret" | null {
  if (key.startsWith("pk_")) return "public";
  if (key.startsWith("sk_")) return "secret";
  return null;
}

export function generateApiKey(keyType: "public" | "secret", environment: "live" | "test" = "live"): string {
  const randomPart = crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "")
    .replace(/\//g, "")
    .replace(/=/g, "")
    .substring(0, 32);
  return `${keyType === "public" ? "pk" : "sk"}_${environment}_${randomPart}`;
}

export function digestApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}

export const SECRET_KEY_LOOKUP_PREFIX_LENGTH = 16;

export function getSecretKeyLookupPrefix(key: string): string {
  return key.substring(0, SECRET_KEY_LOOKUP_PREFIX_LENGTH);
}
