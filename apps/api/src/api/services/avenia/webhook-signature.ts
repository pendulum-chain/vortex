import { BrlaApiService } from "@vortexfi/shared";
import crypto from "crypto";
import logger from "../../../config/logger";

const KEY_TTL_MS = 60 * 60 * 1000;
// Shortest gap between two outbound key fetches. The route is public and anyone can
// make a signature miss, so without this every forged body would cost Avenia a request.
export const REFRESH_COOLDOWN_MS = 30 * 1000;

let cachedKey: { pem: string; fetchedAt: number } | null = null;
let inFlightRefresh: Promise<string> | null = null;
let lastRefreshStartedAt = 0;

function refreshKey(): Promise<string> {
  lastRefreshStartedAt = Date.now();
  inFlightRefresh = BrlaApiService.getInstance()
    .getAveniaPublicKey()
    .then(pem => {
      cachedKey = { fetchedAt: Date.now(), pem };
      return pem;
    })
    .finally(() => {
      inFlightRefresh = null;
    });
  return inFlightRefresh;
}

/**
 * The key to re-check a miss against, or null when a refresh is not allowed right now.
 * Concurrent misses share one fetch, and a burst of them costs at most one fetch per
 * cooldown — so a rotation is still picked up within seconds, but a flood of forgeries
 * cannot be amplified into a flood of Avenia requests.
 */
function refreshedKey(): Promise<string> | null {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  if (Date.now() - lastRefreshStartedAt < REFRESH_COOLDOWN_MS) {
    return null;
  }
  return refreshKey();
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
 * being rejected. That distinguishes a rotation from a forgery, at the cost of one
 * Avenia request per cooldown window rather than one per bad signature.
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

    const refreshed = refreshedKey();
    if (!refreshed) {
      return false;
    }

    return verifyWith(await refreshed, body, signature);
  } catch (error) {
    logger.error(`Failed to verify Avenia webhook signature: ${error}`);
    return false;
  }
}
