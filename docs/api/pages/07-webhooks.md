# 7. Webhooks

Webhooks let partner systems receive transaction lifecycle events without continuously polling the ramp status endpoint.

Register a webhook against either a quote or a widget session:

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

The request body must include exactly one of `quoteId` or `sessionId`. Use `sessionId` when subscribing to events from a widget-hosted ramp instead of a partner-created quote.

Webhook URLs must use HTTPS. Store the returned webhook ID so that the endpoint can be deleted later.

Delete a webhook:

```http
DELETE /v1/webhook/{id}
X-API-Key: sk_live_...
```

## Verification

Verify every webhook before trusting it. Fetch the current public key:

```http
GET /v1/public-key
```

The endpoint returns an RSA-PSS 2048-bit public key in PEM format. Vortex signs webhook payloads with the corresponding private key. Verify each delivery using RSA-PSS with SHA-256 and the key from this endpoint. Reject requests that fail signature verification, contain malformed payloads, or do not match the expected event structure.

Polling `GET /v1/ramp/{id}` is still useful for user-facing status screens, but webhooks are preferable for reconciliation, back-office automation, and support workflows.

---
