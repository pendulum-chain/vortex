import crypto from "crypto";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";

/**
 * Monerium B2B webhook authentication + durable inbox (plan §3, R06).
 *
 * Monerium signs `${webhook-id}.${webhook-timestamp}.${rawBody}` with the base64-decoded
 * bytes after the `whsec_` prefix. The signature header is `v1,<base64 HMAC-SHA256>`.
 * Raw bytes are load-bearing: parsing and re-serialising JSON changes the MAC input.
 */

export const MONERIUM_ID_HEADER = "webhook-id";
export const MONERIUM_SIGNATURE_HEADER = "webhook-signature";
export const MONERIUM_TIMESTAMP_HEADER = "webhook-timestamp";

function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Compare against self to keep timing independent of the mismatch position.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function decodeBase64(value: string, minBytes: number, maxBytes: number): Buffer | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.length >= minBytes && decoded.length <= maxBytes ? decoded : null;
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  webhookId: string | undefined,
  webhookTimestamp: string | undefined,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!webhookId || !webhookTimestamp || !signatureHeader || !secret.startsWith("whsec_")) return false;
  if (webhookId.length > 128) return false;

  const secretBytes = decodeBase64(secret.slice("whsec_".length), 24, 64);
  const signatureMatch = /^v1,([A-Za-z0-9+/]+={0,2})$/.exec(signatureHeader.trim());
  const provided = signatureMatch ? decodeBase64(signatureMatch[1], 32, 32) : null;
  if (!secretBytes || !provided) return false;

  const signedPayload = Buffer.concat([Buffer.from(`${webhookId}.${webhookTimestamp}.`, "utf8"), rawBody]);
  const expected = crypto.createHmac("sha256", secretBytes).update(signedPayload).digest();
  return constantTimeEquals(provided, expected);
}

/**
 * Durably persists a delivery BEFORE the webhook responds 200. `ignoreDuplicates`
 * compiles to `ON CONFLICT DO NOTHING` on the unique event_id — a redelivery is a
 * silent no-op, and the caller still acks with 200.
 */
export async function recordWebhookEvent(eventId: string, payload: unknown): Promise<void> {
  await MoneriumWebhookEvent.bulkCreate([{ eventId, payload }], { ignoreDuplicates: true });
}
