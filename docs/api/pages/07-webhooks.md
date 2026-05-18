# 7. Webhooks

Vortex webhooks let your application receive real-time notifications when ramp lifecycle events occur, instead of continuously polling `GET /v1/ramp/{id}`.

You can subscribe to:

- **Transaction creation** — a new ramp is registered.
- **Status changes** — a ramp's status moves between `PENDING`, `COMPLETE`, and `FAILED`.

## Security Model

Every webhook request includes:

- `X-Vortex-Signature` — RSA-PSS signature of the raw request body, base64-encoded.
- `X-Vortex-Timestamp` — Unix timestamp (seconds) of the request.

All webhook URLs **must use HTTPS**. Signatures are verified against the RSA-PSS 2048-bit public key returned by `GET /v1/public-key`.

## Registering A Webhook

```http
POST /v1/webhook
X-API-Key: sk_live_...
Content-Type: application/json
```

```json
{
  "url": "https://partner.example.com/vortex/webhook",
  "quoteId": "quote_...",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

The body must include **exactly one** of `quoteId` or `sessionId`. Use `sessionId` to subscribe to events from a Widget-hosted ramp instead of a partner-created quote.

Store the returned webhook ID so you can delete it later.

```http
DELETE /v1/webhook/{id}
X-API-Key: sk_live_...
```

Webhook endpoints require a partner secret key. They do not accept Supabase Bearer tokens.

## Event Types

### `TRANSACTION_CREATED`

Fired immediately after the ramp state is created (`POST /v1/ramp/register`).

```json
{
  "eventType": "TRANSACTION_CREATED",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "payload": {
    "quoteId": "quote_...",
    "transactionId": "tx_...",
    "sessionId": "session_...",
    "transactionStatus": "PENDING",
    "transactionType": "BUY"
  }
}
```

| Field | Description |
|---|---|
| `quoteId` | Unique identifier for the quote. |
| `transactionId` | Unique identifier for the ramp (`rampId`). |
| `sessionId` | Widget session identifier if registered against a session. |
| `transactionStatus` | Always `"PENDING"` for new transactions. |
| `transactionType` | `"BUY"` (onramp) or `"SELL"` (offramp). |

### `STATUS_CHANGE`

Fired whenever the ramp's status changes during processing.

```json
{
  "eventType": "STATUS_CHANGE",
  "timestamp": "2025-01-15T10:35:00.000Z",
  "payload": {
    "quoteId": "quote_...",
    "transactionId": "tx_...",
    "sessionId": "session_...",
    "transactionStatus": "COMPLETE",
    "transactionType": "BUY"
  }
}
```

Status values:

- `PENDING` — ramp is in progress.
- `COMPLETE` — ramp completed successfully.
- `FAILED` — ramp failed or timed out.

## Retry Mechanism

Vortex automatically retries failed webhook deliveries:

- **Attempts**: up to 5
- **Backoff**: exponential (1s, 2s, 4s, 8s, 16s)
- **Timeout**: 30 seconds per request
- **Auto-deactivation**: after 5 consecutive failures, the webhook is disabled and must be re-registered.

Return `2xx` quickly. Do heavy work asynchronously after acknowledging the request.

## Verification

Fetch the current public key:

```http
GET /v1/public-key
```

Verify signatures using RSA-PSS with SHA-256. Reject requests that fail signature verification, are outside an acceptable timestamp window, contain malformed payloads, or do not match the expected event structure.

### Example: Bun + TypeScript Listener

```ts
import { serve } from "bun";
import crypto, { KeyObject } from "crypto";

const CONFIG = {
  PORT: Number(process.env.PORT || 3002),
  TIMESTAMP_TOLERANCE_SECONDS: 300
} as const;

enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE"
}

class WebhookVerifier {
  private publicKey?: KeyObject;
  private publicKeyPem?: string;

  private async getPublicKey(): Promise<KeyObject> {
    if (this.publicKey) return this.publicKey;
    if (!this.publicKeyPem) {
      const response = await fetch("https://api.vortexfinance.co/v1/public-key");
      if (!response.ok) throw new Error(`Failed to fetch public key: ${response.statusText}`);
      const data = (await response.json()) as { publicKey: string };
      this.publicKeyPem = data.publicKey;
    }
    this.publicKey = crypto.createPublicKey(this.publicKeyPem);
    return this.publicKey;
  }

  async verifySignature(payload: string, signatureBase64: string): Promise<boolean> {
    const publicKey = await this.getPublicKey();
    const signature = Buffer.from(signatureBase64, "base64");
    return crypto.verify(
      "sha256",
      Buffer.from(payload, "utf8"),
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
      },
      signature
    );
  }

  verifyTimestamp(timestamp: string, toleranceSeconds = CONFIG.TIMESTAMP_TOLERANCE_SECONDS): boolean {
    const webhookTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    return Math.abs(currentTime - webhookTime) <= toleranceSeconds;
  }
}

const verifier = new WebhookVerifier();

serve({
  port: CONFIG.PORT,
  async fetch(req) {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const signature = req.headers.get("x-vortex-signature");
    const timestamp = req.headers.get("x-vortex-timestamp");
    if (!signature || !timestamp) return new Response("Missing required headers", { status: 401 });

    if (!verifier.verifyTimestamp(timestamp)) {
      return new Response("Timestamp outside acceptable window", { status: 401 });
    }

    const bodyText = await req.text();
    if (!bodyText) return new Response("Empty body", { status: 400 });

    if (!(await verifier.verifySignature(bodyText, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(bodyText);
    if (!Object.values(WebhookEventType).includes(event.eventType)) {
      return new Response(`Unsupported event type: ${event.eventType}`, { status: 400 });
    }

    // TODO: route event to your handler (update DB, notify user, etc.).

    return new Response("OK", { status: 200 });
  }
});
```

## When To Still Poll

Webhooks are preferable for reconciliation, back-office automation, and support workflows. Polling `GET /v1/ramp/{id}` is still useful for live user-facing status screens where you want sub-second updates without waiting for the next webhook delivery. `GET /v1/ramp/{id}/errors` returns the structured error log and is useful for support tooling.

---
