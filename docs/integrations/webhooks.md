# Vortex API Webhooks Integration Guide

## Overview

Vortex API webhooks allow you to receive real-time notifications when transaction events occur, eliminating the need to continuously poll the API for status updates. This guide provides everything you need to integrate webhooks into your application.

## Table of Contents

- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Event Types](#event-types)
- [Security & Verification](#security--verification)
- [Subscription Patterns](#subscription-patterns)
- [Implementation Examples](#implementation-examples)
- [Delivery & Reliability](#delivery--reliability)
- [Testing & Troubleshooting](#testing--troubleshooting)

## Getting Started

### Prerequisites

- **HTTPS endpoint**: Your webhook URL must use HTTPS for security
- **Public accessibility**: Your endpoint must be accessible from the internet
- **Response handling**: Your endpoint should respond with HTTP 2xx status codes

### Quick Setup

1. **Create a webhook endpoint** in your application
2. **Register the webhook** with Vortex API
3. **Verify webhook signatures** for security
4. **Handle webhook events** in your application logic

## API Reference

### Register Webhook

Register a new webhook to receive event notifications.

**Endpoint:** `POST /v1/webhooks/register`

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/vortex",
  "transactionId": "optional-transaction-id",
  "sessionId": "optional-session-id",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

**Parameters:**
- `url` (required): Your HTTPS webhook endpoint URL
- `transactionId` (optional): Subscribe to events for a specific transaction
- `sessionId` (optional): Subscribe to events for a specific session
- `events` (optional): Array of event types to subscribe to. Defaults to all events if not specified

**Response (201 Created):**
```json
{
  "id": "webhook-uuid",
  "url": "https://your-app.com/webhooks/vortex",
  "transactionId": "transaction-uuid",
  "sessionId": "session-id",
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"],
  "isActive": true,
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

### Delete Webhook

Remove a webhook subscription.

**Endpoint:** `DELETE /v1/webhooks/{id}`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

## Event Types

Vortex uses enum values for event types and transaction status for better type safety and consistency.

### WebhookEventType Enum

```typescript
export enum WebhookEventType {
  TRANSACTION_CREATED = "TRANSACTION_CREATED",
  STATUS_CHANGE = "STATUS_CHANGE"
}
```

### TransactionStatus Enum

```typescript
export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED"
}
```

### TRANSACTION_CREATED

Triggered when a new transaction is created/started.

**Payload:**
```json
{
  "eventType": "TRANSACTION_CREATED",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "payload": {
    "transactionId": "0512bf0b-3c45-4344-a019-7acbc31fe70f",
    "sessionId": "my-session-id-1",
    "transactionStatus": "PENDING",
    "transactionType": "BUY"
  }
}
```

### STATUS_CHANGE

Triggered when a transaction's status changes.

**Payload:**
```json
{
  "eventType": "STATUS_CHANGE",
  "timestamp": "2025-01-15T10:35:00.000Z",
  "payload": {
    "transactionId": "0512bf0b-3c45-4344-a019-7acbc31fe70f",
    "sessionId": "my-session-id-1",
    "transactionStatus": "COMPLETE",
    "transactionType": "BUY"
  }
}
```

### Transaction Status Values

- `PENDING`: Transaction is in progress
- `COMPLETE`: Transaction completed successfully
- `FAILED`: Transaction failed or was cancelled

### Transaction Type Values

- `BUY`: Onramp transaction (fiat to crypto)
- `SELL`: Offramp transaction (crypto to fiat)

## Security & Verification

All webhook payloads are signed using HMAC-SHA256 for security. You should verify these signatures to ensure the webhook is from Vortex.

### Signature Headers

Each webhook request includes these headers:
- `X-Vortex-Signature`: HMAC-SHA256 signature (format: `sha256=<signature>`)
- `X-Vortex-Timestamp`: Unix timestamp when the webhook was sent
- `User-Agent`: `Vortex-Webhooks/1.0`

### Verification Process

1. **Extract the signature** from the `X-Vortex-Signature` header
2. **Get the timestamp** from the `X-Vortex-Timestamp` header
3. **Compute the expected signature** using your webhook secret
4. **Compare signatures** using a constant-time comparison
5. **Check timestamp** to prevent replay attacks (recommended: within 5 minutes)

### Node.js Verification Example

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret, timestamp) {
  // Check timestamp (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Extract signature from header (remove 'sha256=' prefix)
  const receivedSignature = signature.replace('sha256=', '');

  // Constant-time comparison
  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  )) {
    throw new Error('Invalid webhook signature');
  }

  return true;
}

// Express.js webhook handler
app.post('/webhooks/vortex', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.headers['x-vortex-signature'];
  const timestamp = req.headers['x-vortex-timestamp'];
  const payload = req.body;

  try {
    verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET, timestamp);

    // Parse and process the webhook
    const event = JSON.parse(payload);
    handleWebhookEvent(event);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(400).send('Bad Request');
  }
});
```

### Python Verification Example

```python
import hmac
import hashlib
import time
import json

def verify_webhook_signature(payload, signature, secret, timestamp):
    # Check timestamp (within 5 minutes)
    now = int(time.time())
    if abs(now - int(timestamp)) > 300:
        raise ValueError('Webhook timestamp too old')

    # Compute expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # Extract signature from header (remove 'sha256=' prefix)
    received_signature = signature.replace('sha256=', '')

    # Constant-time comparison
    if not hmac.compare_digest(expected_signature, received_signature):
        raise ValueError('Invalid webhook signature')

    return True

# Flask webhook handler
from flask import Flask, request

@app.route('/webhooks/vortex', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Vortex-Signature')
    timestamp = request.headers.get('X-Vortex-Timestamp')
    payload = request.get_data(as_text=True)

    try:
        verify_webhook_signature(payload, signature, os.environ['WEBHOOK_SECRET'], timestamp)

        # Parse and process the webhook
        event = json.loads(payload)
        handle_webhook_event(event)

        return 'OK', 200
    except Exception as error:
        print(f'Webhook verification failed: {error}')
        return 'Bad Request', 400
```

## Subscription Patterns

### Global Webhooks

Subscribe to all transaction events across your application.

```bash
curl -X POST https://api.vortex.com/v1/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vortex"
  }'
```

**Use case:** Dashboard notifications, analytics, general monitoring

### Transaction-Specific Webhooks

Subscribe to events for a specific transaction.

```bash
curl -X POST https://api.vortex.com/v1/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vortex",
    "transactionId": "0512bf0b-3c45-4344-a019-7acbc31fe70f"
  }'
```

**Use case:** User-specific notifications, order tracking

### Session-Specific Webhooks

Subscribe to events for all transactions within a session.

```bash
curl -X POST https://api.vortex.com/v1/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vortex",
    "sessionId": "user-session-123"
  }'
```

**Use case:** User session tracking, multi-transaction workflows

### Event-Specific Webhooks

Subscribe to only specific event types.

```bash
curl -X POST https://api.vortex.com/v1/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/vortex",
    "events": ["STATUS_CHANGE"]
  }'
```

**Use case:** Only care about completion/failure, not creation events

## Implementation Examples

### Complete Node.js/Express Example

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Middleware to capture raw body for signature verification
app.use('/webhooks', express.raw({type: 'application/json'}));

function verifyWebhookSignature(payload, signature, secret, timestamp) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Webhook timestamp too old');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  const receivedSignature = signature.replace('sha256=', '');

  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  )) {
    throw new Error('Invalid webhook signature');
  }
}

function handleWebhookEvent(event) {
  console.log(`Received ${event.eventType} event:`, event.payload);

  switch (event.eventType) {
    case 'TRANSACTION_CREATED':
      handleTransactionCreated(event.payload);
      break;
    case 'STATUS_CHANGE':
      handleStatusChange(event.payload);
      break;
    default:
      console.log('Unknown event type:', event.eventType);
  }
}

function handleTransactionCreated(payload) {
  // Update your database
  // Send user notification
  // Log for analytics
  console.log(`New ${payload.transactionType} transaction: ${payload.transactionId}`);
}

function handleStatusChange(payload) {
  // Update transaction status in your database
  // Notify user of completion/failure
  // Trigger next steps in your workflow
  console.log(`Transaction ${payload.transactionId} is now ${payload.transactionStatus}`);

  if (payload.transactionStatus === 'COMPLETE') {
    // Handle successful completion
    console.log('Transaction completed successfully!');
  } else if (payload.transactionStatus === 'FAILED') {
    // Handle failure
    console.log('Transaction failed');
  }
}

app.post('/webhooks/vortex', (req, res) => {
  const signature = req.headers['x-vortex-signature'];
  const timestamp = req.headers['x-vortex-timestamp'];
  const payload = req.body;

  try {
    verifyWebhookSignature(
      payload,
      signature,
      process.env.VORTEX_WEBHOOK_SECRET,
      timestamp
    );

    const event = JSON.parse(payload);
    handleWebhookEvent(event);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(400).send('Bad Request');
  }
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### Complete Python/Flask Example

```python
import os
import hmac
import hashlib
import time
import json
from flask import Flask, request

app = Flask(__name__)

def verify_webhook_signature(payload, signature, secret, timestamp):
    now = int(time.time())
    if abs(now - int(timestamp)) > 300:
        raise ValueError('Webhook timestamp too old')

    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    received_signature = signature.replace('sha256=', '')

    if not hmac.compare_digest(expected_signature, received_signature):
        raise ValueError('Invalid webhook signature')

def handle_webhook_event(event):
    print(f"Received {event['eventType']} event:", event['payload'])

    if event['eventType'] == 'TRANSACTION_CREATED':
        handle_transaction_created(event['payload'])
    elif event['eventType'] == 'STATUS_CHANGE':
        handle_status_change(event['payload'])
    else:
        print('Unknown event type:', event['eventType'])

def handle_transaction_created(payload):
    # Update your database
    # Send user notification
    # Log for analytics
    print(f"New {payload['transactionType']} transaction: {payload['transactionId']}")

def handle_status_change(payload):
    # Update transaction status in your database
    # Notify user of completion/failure
    # Trigger next steps in your workflow
    print(f"Transaction {payload['transactionId']} is now {payload['transactionStatus']}")

    if payload['transactionStatus'] == 'COMPLETE':
        print('Transaction completed successfully!')
    elif payload['transactionStatus'] == 'FAILED':
        print('Transaction failed')

@app.route('/webhooks/vortex', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Vortex-Signature')
    timestamp = request.headers.get('X-Vortex-Timestamp')
    payload = request.get_data(as_text=True)

    try:
        verify_webhook_signature(
            payload,
            signature,
            os.environ['VORTEX_WEBHOOK_SECRET'],
            timestamp
        )

        event = json.loads(payload)
        handle_webhook_event(event)

        return 'OK', 200
    except Exception as error:
        print(f'Webhook verification failed: {error}')
        return 'Bad Request', 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
```

## Delivery & Reliability

### Retry Mechanism

Vortex implements a robust retry mechanism for webhook delivery:

- **5 retry attempts** with exponential backoff
- **Retry delays**: 1s, 2s, 4s, 8s, 16s
- **30-second timeout** per request
- **Automatic deactivation** after all retries fail

### Success Criteria

A webhook delivery is considered successful when:
- Your endpoint responds with HTTP status code 2xx (200-299)
- Response is received within 30 seconds

### Failure Handling

If webhook delivery fails:
1. **Temporary failures** (network issues, timeouts) trigger retries
2. **Permanent failures** (4xx errors) may skip retries
3. **After 5 failed attempts**, the webhook is automatically deactivated
4. **Deactivated webhooks** stop receiving events until reactivated

### Monitoring

Monitor your webhook health by:
- **Tracking response times** (should be under 30 seconds)
- **Monitoring error rates** (aim for <1% failure rate)
- **Setting up alerts** for webhook deactivation
- **Logging webhook events** for debugging

### Best Practices

1. **Respond quickly**: Process webhooks asynchronously if needed
2. **Handle duplicates**: Implement idempotency using transaction IDs
3. **Graceful degradation**: Have fallback polling for critical operations
4. **Monitor actively**: Set up alerts for webhook failures
5. **Test thoroughly**: Use webhook testing tools during development

## Testing & Troubleshooting

### Testing Your Webhook Endpoint

#### Using ngrok for Local Development

```bash
# Install ngrok
npm install -g ngrok

# Start your local server
node webhook-server.js

# In another terminal, expose your local server
ngrok http 3000

# Use the HTTPS URL from ngrok to register your webhook
curl -X POST https://api.vortex.com/v1/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhooks/vortex"
  }'
```

#### Manual Testing with curl

```bash
# Test your webhook endpoint manually
curl -X POST https://your-app.com/webhooks/vortex \
  -H "Content-Type: application/json" \
  -H "X-Vortex-Signature: sha256=test-signature" \
  -H "X-Vortex-Timestamp: $(date +%s)" \
  -d '{
    "eventType": "TRANSACTION_CREATED",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "payload": {
      "transactionId": "test-transaction-id",
      "sessionId": "test-session-id",
      "transactionStatus": "PENDING",
      "transactionType": "BUY"
    }
  }'
```

### Common Issues & Solutions

#### Issue: Webhook not receiving events
**Solutions:**
- Verify webhook is registered correctly
- Check that webhook URL is accessible from internet
- Ensure HTTPS is used (HTTP not supported)
- Verify webhook is still active (not deactivated due to failures)

#### Issue: Signature verification failing
**Solutions:**
- Ensure you're using the correct webhook secret
- Verify you're computing HMAC-SHA256 correctly
- Check that you're using the raw request body (not parsed JSON)
- Ensure timestamp is within acceptable range (5 minutes)

#### Issue: Webhook endpoint timing out
**Solutions:**
- Optimize your webhook handler for speed
- Process events asynchronously if needed
- Ensure your server can handle the expected load
- Check for database connection issues

#### Issue: Duplicate events
**Solutions:**
- Implement idempotency using transaction IDs
- Store processed event IDs to detect duplicates
- Use database transactions for atomic processing

### Debugging Tips

1. **Log everything**: Log all incoming webhooks and your processing
2. **Check headers**: Verify all required headers are present
3. **Validate payload**: Ensure JSON parsing succeeds
4. **Monitor timing**: Track how long your webhook handler takes
5. **Test signatures**: Verify signature computation with known test data

### Support

If you encounter issues not covered in this guide:

1. **Check the logs** in your application and server
2. **Verify webhook registration** using the API
3. **Test with a simple webhook handler** to isolate issues
4. **Contact support** with specific error messages and webhook IDs

---

## Summary

Vortex webhooks provide a reliable, secure way to receive real-time transaction updates. Key points to remember:

- **Always use HTTPS** for webhook URLs
- **Verify signatures** for security
- **Handle retries gracefully** with idempotency
- **Monitor webhook health** and set up alerts
- **Test thoroughly** before going to production

With proper implementation, webhooks will significantly improve your user experience by providing instant transaction updates without the overhead of continuous polling.
