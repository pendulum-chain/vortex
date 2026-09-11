import crypto from "crypto";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";

/**
 * Monerium B2B webhook authentication + durable inbox (plan §3, R06).
 *
 * Monerium docs: each notification carries a `webhook-signature` header containing the
 * HMAC-SHA256 of the minified JSON payload under the shared secret. We verify over the
 * RAW request bytes exactly as delivered (never a re-serialization) with a
 * constant-time compare.
 *
 * TODO(sandbox): the docs do not state the digest encoding — hex and base64 are both
 * accepted here until the G0 sandbox spike pins it (both encode the same secret MAC,
 * so accepting either does not widen the trust surface).
 */

export const MONERIUM_SIGNATURE_HEADER = "webhook-signature";

function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Compare against self to keep timing independent of the mismatch position.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  const mac = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(signatureHeader.trim(), "utf8");
  const hexMatch = constantTimeEquals(provided, Buffer.from(mac.toString("hex"), "utf8"));
  const base64Match = constantTimeEquals(provided, Buffer.from(mac.toString("base64"), "utf8"));
  return hexMatch || base64Match;
}

/**
 * Dedup identity for a delivery. Monerium's documented payload (`type`, `timestamp`,
 * `data`) carries no delivery id, so redeliveries are identified by the digest of the
 * raw bytes; a top-level `id` is honored if the payload ever grows one.
 * TODO(sandbox): confirm whether deliveries carry an id field or header.
 */
export function deriveEventId(rawBody: Buffer, payload: unknown): string {
  const id = (payload as { id?: unknown } | null)?.id;
  if (typeof id === "string" && id.length > 0 && id.length <= 128) return id;
  return `sha256:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
}

/**
 * Durably persists a delivery BEFORE the webhook responds 200. `ignoreDuplicates`
 * compiles to `ON CONFLICT DO NOTHING` on the unique event_id — a redelivery is a
 * silent no-op, and the caller still acks with 200.
 */
export async function recordWebhookEvent(eventId: string, payload: unknown): Promise<void> {
  await MoneriumWebhookEvent.bulkCreate([{ eventId, payload }], { ignoreDuplicates: true });
}
