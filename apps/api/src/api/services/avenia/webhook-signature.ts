import { BrlaApiService } from "@vortexfi/shared";
import crypto from "crypto";
import logger from "../../../config/logger";

const KEY_TTL_MS = 60 * 60 * 1000;

let cachedKey: { pem: string; fetchedAt: number } | null = null;

async function fetchAndCacheKey(): Promise<string> {
  const pem = await BrlaApiService.getInstance().getAveniaPublicKey();
  cachedKey = { fetchedAt: Date.now(), pem };
  return pem;
}

function verifyWith(pem: string, body: Buffer, signature: Buffer): boolean {
  return crypto.verify(
    "sha256",
    body,
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      // Avenia signs with the maximum salt length; AUTO reads the actual length back
      // out of the signature, so this stays correct if they ever change it.
      saltLength: crypto.constants.RSA_PSS_SALTLEN_AUTO
    },
    signature
  );
}

/**
 * Verifies an Avenia webhook against their published RSA key (RSA-PSS, SHA-256).
 *
 * The signature covers the raw request body, so the caller must pass the unparsed
 * bytes: re-serialising the parsed JSON does not reproduce them byte for byte.
 *
 * Avenia's guide states the key rotates and must never be pinned, so a body that
 * fails against the cached key is retried once against a freshly fetched one before
 * being rejected. That distinguishes a rotation from a forgery at the cost of one
 * request per bad signature.
 */
export async function verifyAveniaSignature(body: Buffer, signatureBase64: string): Promise<boolean> {
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, "base64");
  } catch {
    return false;
  }

  try {
    const cached = cachedKey && Date.now() - cachedKey.fetchedAt < KEY_TTL_MS ? cachedKey.pem : null;
    if (cached && verifyWith(cached, body, signature)) {
      return true;
    }

    return verifyWith(await fetchAndCacheKey(), body, signature);
  } catch (error) {
    logger.error(`Failed to verify Avenia webhook signature: ${error}`);
    return false;
  }
}
