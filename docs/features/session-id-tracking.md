# Session ID Tracking

## Overview

Vortex supports session tracking to enable integrators to correlate transactions initiated through the widget with their own internal systems. This is accomplished through a session identifier that flows through the entire ramp process.

## Key Concept

**`externalSessionId` (Frontend) = `sessionId` (Backend)**

These are the **same value** with different naming conventions:
- **Frontend**: Uses `externalSessionId` to indicate the ID originates from an external integrator // Meld requirement
- **Backend**: Uses `sessionId` as it represents a session identifier within the system

## Use Cases

Session tracking enables integrators to:
- **Correlate Transactions**: Match widget transactions with their internal order/session IDs
- **Receive Targeted Webhooks**: Filter webhook notifications by session ID
- **Track User Journeys**: Monitor the complete lifecycle of a transaction
- **Support Multiple Concurrent Sessions**: Handle multiple users/transactions simultaneously

## Data Flow

```
┌─────────────────┐
│   Integrator    │
│   System        │
└────────┬────────┘
         │ Creates session: "partner-tx-123"
         │
         ▼
    Opens Widget URL:
    ?externalSessionId=partner-tx-123
         │
         ▼
┌─────────────────────────────┐
│   Frontend (Widget)         │
│                             │
│  State Machine Context:     │
│  externalSessionId: "..."   │
└────────┬────────────────────┘
         │
         │ User creates quote
         ▼
    POST /quotes
    { sessionId: "partner-tx-123" }
         │
         ▼
┌─────────────────────────────┐
│   Backend API               │
│                             │
│  QuoteTicket:               │
│  metadata.sessionId: "..."  │
└────────┬────────────────────┘
         │
         │ User registers ramp
         ▼
    POST /ramp/register
    { additionalData: {
        sessionId: "partner-tx-123"
      }
    }
         │
         ▼ (Validation: sessionId matches?)
┌─────────────────────────────┐
│   Backend Validation        │
│                             │
│  ✓ Match → Proceed          │
│  ✗ Mismatch → Error 400     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   Database                  │
│                             │
│  RampState:                 │
│  state.sessionId: "..."     │
└────────┬────────────────────┘
         │
         │ Status changes
         ▼
    Webhook Notifications
    { sessionId: "partner-tx-123" }
         │
         ▼
┌─────────────────┐
│   Integrator    │
│   Webhook       │
│   Handler       │
└─────────────────┘
```

## Integration Methods

### Method 1: URL Parameter (Recommended)

Pass the session ID directly in the widget URL:

```
https://www.vortexfinance.co/widget?externalSessionId=partner-tx-123&rampType=BUY&...
```

**Frontend automatically:**
1. Reads `externalSessionId` from URL
2. Stores in state machine context
3. Includes in quote creation
4. Includes in ramp registration

### Method 2: Session Widget URL API

Use the session endpoint to generate a widget URL with embedded session ID:

```typescript
POST /session

// Locked (with existing quote)
{
  "quoteId": "quote-uuid",
  "externalSessionId": "partner-tx-123",
  "walletAddressLocked": "0x..." // optional
}

// Refresh (creates new quote)
{
  "externalSessionId": "partner-tx-123",
  "rampType": "BUY",
  "inputAmount": "100",
  "inputCurrency": "EUR",
  "outputCurrency": "USDC",
  "from": "sepa",
  "to": "polygon"
}

// Response
{
  "url": "https://widget.vortex.com?externalSessionId=partner-tx-123&..."
}
```

## Storage Locations

### Frontend Storage (Temporary)

**Location**: `apps/frontend/src/machines/ramp.machine.ts`

```typescript
context: {
  externalSessionId?: string;  // In-memory only
}
```

- ❌ NOT persisted to localStorage
- ❌ NOT persisted to database
- ✅ Only exists during widget session
- ✅ Lost on page refresh

### Backend Storage (Persistent)

#### 1. Quote Metadata (Optional)

**Location**: `apps/api/src/models/quoteTicket.model.ts`

```typescript
interface QuoteTicketMetadata {
  sessionId?: string;  // Stored in JSONB 'metadata' column
  // ... other fields
}
```

**When stored**: If `sessionId` is provided in `POST /quotes` request

#### 2. Ramp State Metadata (Always, if provided)

**Location**: `apps/api/src/api/services/phases/meta-state-types.ts`

```typescript
interface StateMetadata {
  sessionId?: string;  // Stored in JSONB 'state' column
  // ... other fields
}
```

**When stored**: When ramp is registered with `sessionId` in `additionalData`

## Validation Logic

### SessionId Matching

**Location**: `apps/api/src/api/services/ramp/ramp.service.ts`

When registering a ramp, the backend validates that the sessionId in the request matches the sessionId stored in the quote:

```typescript
// Validate sessionId if both are provided
const requestSessionId = additionalData?.sessionId;
const quoteSessionId = quote.metadata.sessionId;

if (requestSessionId && quoteSessionId && requestSessionId !== quoteSessionId) {
  throw new APIError({
    message: `SessionId mismatch. Quote has sessionId '${quoteSessionId}' but request provided '${requestSessionId}'`,
    status: httpStatus.BAD_REQUEST
  });
}
```

### Validation Scenarios

| Quote SessionId | Request SessionId | Result |
|----------------|-------------------|--------|
| ✅ Present | ✅ Present & Match | ✅ Valid - Use the value |
| ✅ Present | ✅ Present & Different | ❌ Error 400 - Mismatch |
| ✅ Present | ❌ Not provided | ✅ Valid - Use quote value |
| ❌ Not present | ✅ Present | ✅ Valid - Use request value |
| ❌ Not present | ❌ Not provided | ✅ Valid - No session tracking |

## API Response Fields

### Quote Response

```typescript
POST /quotes
GET /quotes/:id

Response:
{
  "id": "quote-uuid",
  "sessionId": "partner-tx-123",  // ← If provided
  // ... other fields
}
```

### Ramp Status Response

```typescript
GET /ramp/:id

Response:
{
  "id": "ramp-uuid",
  "quoteId": "quote-uuid",
  "sessionId": "partner-tx-123",  // ← Always included if available
  "status": "PENDING",
  // ... other fields
}
```

## Webhook Integration

### Webhook Registration

Register webhooks filtered by session ID:

```typescript
POST /webhooks

{
  "url": "https://integrator.com/webhook",
  "sessionId": "partner-tx-123",  // ← Filter by this session
  "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
}
```

### Webhook Payload

All webhook payloads include the session ID:

```typescript
{
  "eventType": "STATUS_CHANGE",
  "timestamp": "2025-10-14T12:00:00Z",
  "payload": {
    "quoteId": "quote-uuid",
    "sessionId": "partner-tx-123",  // ← Match to your session
    "transactionStatus": "COMPLETE",
    "transactionType": "BUY"
  }
}
```

## Complete Integration Example

### Step 1: Create Session in Your System

```typescript
// Your backend
const userSession = {
  id: "order-2024-10-14-001",
  userId: "user-123",
  amount: 100,
  currency: "EUR"
};

await db.sessions.create(userSession);
```

### Step 2: Generate Widget URL

```typescript
// Option A: Direct URL
const widgetUrl = `https://widget.vortex.com?` +
  `externalSessionId=${userSession.id}` +
  `&rampType=BUY` +
  `&inputAmount=100` +
  `&fiat=EUR` +
  `&crypto=USDC` +
  `&network=polygon`;

// Option B: Via API
const response = await fetch('https://api.vortex.com/session', {
  method: 'POST',
  body: JSON.stringify({
    externalSessionId: userSession.id,
    rampType: 'BUY',
    inputAmount: '100',
    inputCurrency: 'EUR',
    outputCurrency: 'USDC',
    from: 'sepa',
    to: 'polygon'
  })
});

const { url: widgetUrl } = await response.json();
```

### Step 3: Register Webhook

```typescript
await fetch('https://api.vortex.com/webhooks', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://your-api.com/webhooks/vortex',
    sessionId: userSession.id,  // Filter for this session only
    events: ['TRANSACTION_CREATED', 'STATUS_CHANGE']
  })
});
```

### Step 4: Handle Webhooks

```typescript
app.post('/webhooks/vortex', async (req, res) => {
  const { payload } = req.body;

  // Find your session by sessionId
  const session = await db.sessions.findOne({
    id: payload.sessionId
  });

  if (!session) {
    return res.status(404).send('Session not found');
  }

  // Update your session status
  await db.sessions.update(session.id, {
    vortexStatus: payload.transactionStatus,
    vortexQuoteId: payload.quoteId,
    updatedAt: new Date()
  });

  // Notify your user
  await notifyUser(session.userId, {
    status: payload.transactionStatus
  });

  res.status(200).send('OK');
});
```

### Step 5: Query Transaction Status

```typescript
// Later, check status using your session ID
const ramps = await fetch(
  `https://api.vortex.com/ramp/history/${session.walletAddress}`
);

const userRamp = ramps.transactions.find(
  tx => tx.sessionId === userSession.id
);

console.log('Ramp status:', userRamp.status);
```

## Code References

### Frontend Files

- **URL Parameter Parsing**: `apps/frontend/src/hooks/useRampUrlParams.ts`
- **State Machine Context**: `apps/frontend/src/machines/ramp.machine.ts`
- **Register Actor**: `apps/frontend/src/machines/actors/register.actor.ts`

### Backend Files

- **Session Controller**: `apps/api/src/api/controllers/session.controller.ts`
- **Ramp Service (Validation)**: `apps/api/src/api/services/ramp/ramp.service.ts`
- **Quote Model**: `apps/api/src/models/quoteTicket.model.ts`
- **State Metadata Types**: `apps/api/src/api/services/phases/meta-state-types.ts`

### Shared Types

- **Session Endpoints**: `packages/shared/src/endpoints/session.ts`
- **Ramp Endpoints**: `packages/shared/src/endpoints/ramp.endpoints.ts`
- **Quote Endpoints**: `packages/shared/src/endpoints/quote.endpoints.ts`

## Troubleshooting

### Error: "SessionId mismatch"

**Cause**: The sessionId in the ramp registration request doesn't match the sessionId stored in the quote.

**Solution**:
1. Ensure you're using the same `externalSessionId` throughout the flow
2. Check that the widget URL includes the correct `externalSessionId` parameter
3. Verify the quote was created with the sessionId included

### SessionId Not Appearing in Webhooks

**Cause**: SessionId was not provided during quote creation or ramp registration.

**Solution**:
1. Ensure `externalSessionId` is in the widget URL
2. Verify it's being read correctly in the frontend
3. Check that it's included in the quote creation request
4. Confirm it's in the ramp registration `additionalData`

### Webhooks Not Filtering by SessionId

**Cause**: Webhook registration didn't include sessionId filter.

**Solution**:
```typescript
// Register webhook WITH sessionId
POST /webhooks
{
  "url": "...",
  "sessionId": "your-session-id",  // ← Include this
  "events": ["STATUS_CHANGE"]
}
```

## Best Practices

### 1. Use Unique Session IDs

Generate unique, non-guessable session IDs:

```typescript
// ✅ Good
const sessionId = `${userId}-${Date.now()}-${randomUUID()}`;

// ❌ Bad (predictable)
const sessionId = `user-${userId}`;
```

### 2. Track Sessions in Your Database

```typescript
interface Session {
  id: string;              // Your session ID
  userId: string;
  vortexQuoteId?: string;  // Store Vortex IDs
  vortexRampId?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Include SessionId in All Requests

Always include the sessionId when available:

```typescript
// Quote creation
await createQuote({
  sessionId: mySessionId,  // ← Include
  // ... other params
});

// Ramp registration
await registerRamp(quoteId, accounts, {
  sessionId: mySessionId,  // ← Include
  // ... other data
});
```

### 4. Handle Missing SessionIds Gracefully

Not all transactions will have session IDs (direct widget access):

```typescript
if (webhook.payload.sessionId) {
  // Match to your session
  await updateSession(webhook.payload.sessionId, status);
} else {
  // Handle sessionless transaction
  // Maybe match by wallet address or quote ID
  await logUnmatchedTransaction(webhook.payload);
}
```

## Summary

- **SessionId enables integrators to track transactions** through the entire ramp lifecycle
- **Same value, different names**: `externalSessionId` (frontend) = `sessionId` (backend)
- **Flows through**: URL → Frontend → Quote → Ramp → Webhooks
- **Validated on ramp registration** to ensure consistency
- **Stored persistently** in database for later retrieval
- **Optional but recommended** for production integrations
- **Webhook filtering** enables targeted notifications per session

For questions or issues, please refer to the code references above or contact the Vortex development team.
