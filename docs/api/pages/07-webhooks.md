# Webhooks

Vortex webhooks let your application receive real-time notifications when ramp lifecycle events occur, instead of continuously polling `GET /v1/ramp/{id}`.

You can subscribe to:

- **Transaction creation** — a new ramp is registered.
- **Status changes** — a ramp's status moves between `PENDING`, `COMPLETE`, and `FAILED`.
- **Deposit events** — for partner managers with business EUR onramp accounts: a client's EUR deposit was received (`DEPOSIT_RECEIVED`), converted and forwarded (`DEPOSIT_CONVERTED`), or refunded because it could not be converted within the promised window (`DEPOSIT_RETURNED`). See [Deposit Events](#deposit-events) — they follow account-scoped rules and durable delivery. Business EUR onramp accounts are available in sandbox; production activation is pending.

## Security Model

Every webhook request includes:

- `X-Vortex-Signature` — base64-encoded RSA-PSS signature of the string `{timestamp}.{body}`, where `{timestamp}` is the value of `X-Vortex-Timestamp` and `{body}` is the raw request body. Because the timestamp is part of the signed string, a captured delivery cannot be replayed later with a fresh timestamp.
- `X-Vortex-Timestamp` — Unix timestamp (seconds) of the delivery attempt.

Every event payload also carries an `eventId` that is unique per event and stays the same across delivery retries. Deduplicate on it: if you have already processed an `eventId`, acknowledge the request with `2xx` and skip your handler.

All webhook URLs **must use HTTPS** and must not embed credentials. The hostname is checked at registration and again before every delivery: if it resolves to a private or otherwise non-public address the request is rejected. A hostname that does not resolve yet is accepted at registration (so you can register before DNS is live), but deliveries to it will fail until it resolves publicly. Signatures are verified against the RSA-PSS 2048-bit public key returned by `GET /v1/public-key`.

Webhooks are bound to the account behind your secret key: you can only subscribe to a `quoteId` created with your key (any other quote returns `404`), and you can only delete webhooks your account registered.

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

For the transaction events, the body must include **exactly one** of `quoteId` or `sessionId`. Use `sessionId` to subscribe to events from a Widget-hosted ramp instead of a partner-created quote. Omitting `events` subscribes to the two transaction events only — deposit events are never a default.

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
  "eventId": "9f0c9a4e-4a3b-4a52-b0aa-1f6dc78c4a01",
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
| `eventId` | Unique event identifier, stable across delivery retries — use for deduplication. |
| `quoteId` | Unique identifier for the quote. |
| `transactionId` | Unique identifier for the ramp (`rampId`). |
| `sessionId` | Widget session identifier if registered against a session. |
| `transactionStatus` | Always `"PENDING"` for new transactions. |
| `transactionType` | `"BUY"` (onramp) or `"SELL"` (offramp). |

### `STATUS_CHANGE`

Fired whenever the ramp's status changes during processing.

```json
{
  "eventId": "5b8a0f1d-2e64-49c7-9d3b-8f2a3f0e6c22",
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

## Deposit Events

Business EUR onramp accounts, and with them deposit events, are available in sandbox; production activation is pending.

Managers whose business clients hold EUR onramp accounts can subscribe to deposit events instead of polling `GET /v1/monerium-b2b/deposits`. These subscriptions follow account-scoped rules:

- Register with your **manager profile's own secret key** (no `X-Managed-Profile-Id` header, no `quoteId`/`sessionId`) and an explicit `events` list containing only deposit events. Mixing them with transaction events is rejected, as is a partner-scoped credential.
- One subscription covers **all your managed children's accounts**; the payload identifies the child by `profileId` and the account by `accountId`.
- For the full lifecycle, subscribe to `DEPOSIT_UPDATED` and `ACCOUNT_UPDATED`. The milestone events `DEPOSIT_RECEIVED`, `DEPOSIT_CONVERTED` and `DEPOSIT_RETURNED` remain for integrations that only need those three moments.

```json
{
  "url": "https://manager.example.com/vortex/deposits",
  "events": ["DEPOSIT_UPDATED", "ACCOUNT_UPDATED"]
}
```

### `DEPOSIT_RECEIVED`

Fired once when a client's EUR deposit has been matched to the corresponding on-chain mint. A provider-reported order without verified chain identity does not emit this event.

```json
{
  "eventId": "deposit-received:9f6f6a7e-...",
  "eventType": "DEPOSIT_RECEIVED",
  "timestamp": "2025-01-15T10:35:00.000Z",
  "payload": {
    "accountId": "c2a5...",
    "profileId": "7d1b...",
    "depositId": "9f6f6a7e-...",
    "amountRaw": "100000000000000000000",
    "currency": "eur",
    "status": "minted",
    "txHash": "0x..."
  }
}
```

`amountRaw` is in 18-decimal base units of the deposit currency.

### `DEPOSIT_CONVERTED`

Fired once per deposit after the whole deposit has been converted and forwarded to the destination in a single transfer, and that transfer has reached a safe confirmation depth on chain. A deposit larger than the per-swap cap is converted in several chunks that accumulate on the forwarding contract; the destination still receives one transfer and you receive one event.

```json
{
  "eventId": "deposit-converted:9f6f6a7e-...",
  "eventType": "DEPOSIT_CONVERTED",
  "timestamp": "2025-01-15T10:41:00.000Z",
  "payload": {
    "accountId": "c2a5...",
    "profileId": "7d1b...",
    "depositId": "9f6f6a7e-...",
    "amountRaw": "100000000000000000000",
    "currency": "eur",
    "status": "forwarded",
    "txHash": "0x...",
    "conversions": [
      {
        "eureInRaw": "60000000000000000000",
        "execution": { "feeRaw": "81000", "referenceRateRaw": "108140000", "subsidyRaw": "0" },
        "executionId": "e77a...",
        "txHash": "0x...",
        "usdcNetRaw": "64800000"
      },
      {
        "eureInRaw": "40000000000000000000",
        "execution": { "feeRaw": "0", "referenceRateRaw": "108120000", "subsidyRaw": "120000" },
        "executionId": "f88b...",
        "txHash": "0x...",
        "usdcNetRaw": "43200000"
      }
    ],
    "forwardTxHash": "0x...",
    "usdcNetRaw": "108000000"
  }
}
```

Each `conversions[]` entry is one chunk swap of this deposit: the EURe it consumed and its net USDC. Chunks are never shared between deposits. `forwardTxHash` is the transaction that pushed the whole converted deposit to the destination, and the payload-level `usdcNetRaw` is the amount that single transfer carried (the sum of the chunks' nets).

Deposit `status` values: `pending`, `minted`, `held`, `returned` (provider states), then `converting`, `forwarded`, or — when a payment cannot be converted within the promised window — `recovering`, `refunded`, `recovery_failed`. `DEPOSIT_RECEIVED` may already report `converting` when conversion started within the same minute.

The nested `execution` object is the chunk's pricing: `referenceRateRaw` is the EUR/USD reference the swap was settled against, the Coinbase Exchange EURC-USDC bid/ask midpoint read just before the swap (8 decimals), `feeRaw` the fee taken above the agreed target, and `subsidyRaw` the top-up paid to reach the agreed floor (both 6-decimal USDC base units). The chunk's `usdcNetRaw` already includes both.

### `DEPOSIT_RETURNED`

Fired once per deposit that could not be converted within the promised window (or that an operator withdrew from conversion), after Vortex refunded the full EUR amount to the bank account the payment came from. Chunks already converted are swapped back and any shortfall is covered by Vortex; the payer always receives the exact issue amount.

```json
{
  "eventId": "deposit-returned:9f6f6a7e-...",
  "eventType": "DEPOSIT_RETURNED",
  "timestamp": "2025-01-15T13:05:00.000Z",
  "payload": {
    "accountId": "c2a5...",
    "profileId": "7d1b...",
    "depositId": "9f6f6a7e-...",
    "amountRaw": "100000000000000000000",
    "currency": "eur",
    "status": "refunded",
    "txHash": "0x...",
    "refund": {
      "amount": "100.00",
      "payerIbanMasked": "DE89…3000",
      "redeemOrderId": "8c0fd7b1-...",
      "recoverTxHash": "0x..."
    }
  }
}
```

`refund.amount` is the EUR amount refunded, to the cent — always the full issue amount. `payerIbanMasked` identifies the receiving account by its first and last four characters, `redeemOrderId` is the EUR provider's order for the outgoing SEPA transfer, and `recoverTxHash` the transaction that moved the deposit off the forwarding contract.

### `DEPOSIT_UPDATED`

Fired whenever anything about a deposit changes: the payment arrives at the EUR provider, EURe is minted, a conversion chunk is sent or confirmed, the deposit starts or stops waiting, the converted USDC is delivered, or the deposit enters and completes the refund path. The payload is the deposit's full snapshot, the same object `GET /v1/monerium-b2b/deposits` returns, so you can upsert it by `depositId` and never miss a stage. A deposit is reported as `forwarded` once its transfer reached the same safe confirmation depth as `DEPOSIT_CONVERTED`.

```json
{
  "eventId": "deposit-updated:9f6f6a7e-...:3b1c9e0f2a7d4e61",
  "eventType": "DEPOSIT_UPDATED",
  "timestamp": "2025-01-15T10:36:20.000Z",
  "payload": {
    "depositId": "9f6f6a7e-...",
    "accountId": "c2a5...",
    "profileId": "7d1b...",
    "externalSubjectId": "client-1",
    "moneriumProfileId": "0b8e...",
    "moneriumOrderId": "5a2c...",
    "status": "converting",
    "currency": "eur",
    "amount": "15000.00",
    "amountRaw": "15000000000000000000000",
    "txHash": "0x...",
    "receivedAt": "2025-01-15T10:34:58.000Z",
    "mintedAt": "2025-01-15T10:35:00.000Z",
    "waiting": { "reason": "below_floor", "since": "2025-01-15T10:36:20.000Z" },
    "rejectedReason": null,
    "conversions": [
      {
        "executionId": "e77a...",
        "status": "confirmed",
        "eureInRaw": "10000000000000000000000",
        "execution": { "feeRaw": "81000", "referenceRateRaw": "108140000", "subsidyRaw": "0" },
        "usdcNetRaw": "10800000000",
        "txHash": "0x...",
        "sentAt": "2025-01-15T10:35:20.000Z",
        "confirmedAt": "2025-01-15T10:35:44.000Z"
      }
    ],
    "usdcNetRaw": "10800000000",
    "forwardTxHash": null,
    "deliveredAt": null,
    "refund": null
  }
}
```

- **IDs:** `depositId`, `accountId`, `profileId` (your managed child, the `X-Managed-Profile-Id` value), `externalSubjectId` (your own client reference), and `moneriumProfileId` and `moneriumOrderId` (the EUR provider's IDs for the client and for the incoming payment). Every transaction hash is included: the mint (`txHash`), each chunk, the forward, and on a refund the recovery transaction and the provider's redemption order.
- **Amounts:** `amount` is the EUR amount to the cent and `amountRaw` the same in 18-decimal base units. Each chunk carries the EURe it converted and its net USDC; the top-level `usdcNetRaw` is the sum of the confirmed chunks, which the single transfer delivers.
- **Timestamps:** `receivedAt`, `mintedAt` (the conversion window counts from here), each chunk's `sentAt` and `confirmedAt`, `deliveredAt`, and on a refund `refund.startedAt` and `refund.refundedAt`.
- **Hold status:** `waiting` is set while the deposit waits. `monerium_pending` means the EUR provider has not minted it yet: it is minting or under a compliance review, which the provider does not tell apart. After the mint, the reason Vortex is holding the next chunk: `oracle_unavailable`, `reference_unavailable`, `reference_out_of_band`, `no_route`, or `below_floor`, when the market is below the client's floor by more than the subsidy currently allows.
- **Failure status:** `rejectedReason` holds the provider's reason when it returned the payment before minting (`status` is then `returned`). `refund.reason` says why a deposit is refunded: `window_missed`, `compliance`, `incident`, or `operator`.

`eventId` is unique per snapshot. If retries deliver an older snapshot after a newer one, keep the one with the later `timestamp`.

### `ACCOUNT_UPDATED`

Fired whenever an onramp account's snapshot changes: when it is set up, when its IBAN is issued, and when its status or dormancy changes. Use it to learn when a client's IBAN is ready. The payload is the account object returned by `GET /v1/monerium-b2b/account` and `GET /v1/monerium-b2b/accounts`.

```json
{
  "eventId": "account-updated:c2a5...:9d04b7e2c1aa5f30",
  "eventType": "ACCOUNT_UPDATED",
  "timestamp": "2025-01-14T09:12:00.000Z",
  "payload": {
    "accountId": "c2a5...",
    "profileId": "7d1b...",
    "externalSubjectId": "client-1",
    "moneriumProfileId": "0b8e...",
    "status": "active",
    "iban": "EE12 3456 7890 1234 5678",
    "destination": "0x...",
    "forwarderAddress": "0x...",
    "targetPpm": 1250,
    "floorPpm": 1500,
    "dormantSince": null,
    "createdAt": "2025-01-14T09:00:00.000Z"
  }
}
```

### Delivery Semantics

Deposit events are delivered **durably, at least once**: each event is persisted before sending and retried with growing backoff (1, 5, 15, 60, 180 minutes; abandoned after 6 attempts). Unlike transaction webhooks, a failing endpoint never deactivates the subscription — deliveries resume when your endpoint recovers, and outages lose nothing that has not exhausted its retries. Deduplicate on `eventId`; events are emitted only from subscription time forward (history is never replayed to a new subscription).

## Retry Mechanism

Vortex automatically retries failed **transaction webhook** deliveries:

- **Attempts**: up to 5
- **Backoff**: exponential (1s, 2s, 4s, 8s, 16s)
- **Timeout**: 30 seconds per request
- **Auto-deactivation**: after 5 consecutive failures, the webhook is disabled and must be re-registered.

Deposit events use the durable delivery semantics above instead.

Return `2xx` quickly. Do heavy work asynchronously after acknowledging the request.

## Verification

Fetch the current public key:

```http
GET /v1/public-key
```

Verify signatures using RSA-PSS with SHA-256 over the string `{timestamp}.{body}` — the `X-Vortex-Timestamp` header value, a literal dot, then the raw request body. Reject requests that fail signature verification, are outside an acceptable timestamp window, contain malformed payloads, or do not match the expected event structure, and deduplicate on `eventId`.

### Example: Bun + TypeScript Listener

```js
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

    // The signature covers the timestamp header and the raw body, joined by a dot.
    if (!(await verifier.verifySignature(`${timestamp}.${bodyText}`, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(bodyText);
    if (!Object.values(WebhookEventType).includes(event.eventType)) {
      return new Response(`Unsupported event type: ${event.eventType}`, { status: 400 });
    }

    // TODO: deduplicate on event.eventId (stable across retries), then route the
    // event to your handler (update DB, notify user, etc.).

    return new Response("OK", { status: 200 });
  }
});
```

## When To Still Poll

Webhooks are preferable for reconciliation, back-office automation, and support workflows. Polling `GET /v1/ramp/{id}` is still useful for live user-facing status screens where you want sub-second updates without waiting for the next webhook delivery. `GET /v1/ramp/{id}/errors` returns the structured error log and is useful for support tooling.

---
