# Decision Log

## 2025-04-28: Enhanced Fee Structure Design

### Decision
Adopted a new database schema and backend logic to support a granular fee structure (network, processing, partner markup) standardized in USD. Replaced the single `fee` field in `quote_tickets`. Introduced `partners` and `fee_configurations` tables. Partner identification will be via `partner_id` (UUID) passed in the quote request.

### Rationale
To provide transparency and flexibility in fee calculation, allowing for different fee components (base fees, network costs, partner-specific markups) to be tracked and applied individually. Simplifies future adjustments and partner integrations compared to a single opaque fee. Using a direct `partner_id` from the frontend was chosen over API key authentication for initial simplicity.

### Implementation Details
- **Database:** Modify `quote_tickets`, create `partners`, create `fee_configurations` tables as specified in `docs/architecture/fee-enhancement-plan.md`.
- **Backend:** Update `QuoteService` to validate optional `partner_id`, fetch configurations from new tables, calculate fee components in USD, and save the breakdown to `quote_tickets`.
- **API:** Update `/v1/ramp/quotes` DTOs to accept optional `partner_id` and return the fee breakdown.
- **Network Fee:** Use a static 1 USD estimate initially, configured in `fee_configurations`.


## 2025-04-29: Fee Calculation Refactoring Implementation

### Decision
Refactored the fee calculation logic in `api/src/api/services/ramp/quote.service.ts` to use database configurations, dynamically calculate network fees, and deduct the total fee from the gross output amount.

### Rationale
To improve accuracy, transparency, and maintainability of fee handling, aligning with the enhanced fee structure design decision from 2025-04-28. Addresses previous placeholder logic and incorporates dynamic network cost estimation.

### Implementation Details
1.  **Fee Sources:**
    *   Vortex Foundation fee sourced from the 'vortex_foundation' partner record.
    *   Anchor fees sourced from `fee_configurations` table (`feeType: 'anchor_base'`).
    *   Partner markup sourced from the quote's specific partner.
    *   Static `network_estimate` fee type removed from `FeeConfiguration` model and migrations.
2.  **Calculation Flow:**
    *   Renamed `calculateOutputAmount` to `calculateGrossOutputAndNetworkFee`. This function now returns the gross swap output and a dynamically calculated `networkFeeUSD` (using a stub 1 GLMR = 0.08 USD rate for EVM on-ramps via Squidrouter, '0' otherwise).
    *   Refactored `calculateFeeComponents` to *only* calculate `vortexFee`, `anchorFee`, and `partnerMarkupFee` in USD.
    *   Updated `createQuote` to:
        *   Call the two calculation functions.
        *   Sum all four fee components (`networkFeeUSD`, `vortexFee`, `anchorFee`, `partnerMarkupFee`) to get `totalFeeUSD`.
        *   Convert `totalFeeUSD` to the output currency using a **new placeholder function `convertFeeToOutputCurrency` (marked with a TODO for proper implementation with price feeds)**.
        *   Calculate `finalOutputAmount` by subtracting the (placeholder-converted) total fee from `grossOutputAmount`.
        *   Store `finalOutputAmount` and the detailed USD fee breakdown (`{ network, vortex, anchor, partnerMarkup, total, currency }`) in the `QuoteTicket`.
    *   Updated `getQuote` to correctly transform the stored detailed fees into the summarized API response format.
3.  **Cleanup:** Deleted the obsolete helper file `api/src/api/helpers/quote.ts`.

### Known Issues/TODOs
- The `convertFeeToOutputCurrency` function uses placeholder logic. It **must** be implemented with real price feed data for accurate fee deduction, especially for non-USD output currencies.
- The GLMR-&gt;USD conversion rate in `calculateGrossOutputAndNetworkFee` is hardcoded (0.08) and needs replacement with dynamic price fetching.

## 2025-12-06: Implementation of updateRamp Endpoint

### Decision
Implemented a new `updateRamp` endpoint that allows the frontend to submit presigned transactions and additional data before calling `startRamp`. This decouples data submission from process initiation, improving resilience against failures where Vortex doesn't process transactions properly.

### Rationale
In the past, there were issues where an offramp could not be processed because while the user signed and submitted the transaction on their side, Vortex did not process it properly and never called into the 'startRamp' endpoint. Since 'startRamp' was never called with the presigned transactions of the ephemerals, the ramp couldn't be completed even though the funds left the user's account.

### Implementation Details
1. **Backend Changes:**
   - Added `UpdateRampRequest` and `UpdateRampResponse` DTOs to shared package
   - Extended `RampState` model with `additionalData` field (nullable JSONB)
   - Implemented `updateRamp` controller and service methods
   - Added `POST /v1/ramp/:rampId/update` route
   - Modified `startRamp` to use data from `RampState` instead of request parameters
   - Created database migration `007-add-additional-data-to-ramp-states.ts`

2. **Frontend Changes:**
   - Updated `StartRampRequest` DTO to only require `rampId`
   - Added `updateRamp` method to frontend `RampService`
   - Integrated `updateRamp` calls in `useRegisterRamp` hook:
     - Called after ephemeral transactions are signed
     - Called again after user transactions are signed (for offramps) with additional data

3. **New Flow:**
   - `register` → `updateRamp` (ephemeral txs) → `updateRamp` (user txs + hashes) → `start`
   - The backend merges data from multiple `updateRamp` calls
   - `startRamp` validates that required data is present before processing

### Benefits
- Improved resilience: Data is stored before process initiation
- Better error recovery: Failed `startRamp` calls can be retried without re-signing
- Cleaner separation of concerns: Data submission vs. process execution
- Maintains existing security model: No private keys stored on backend

## 2025-06-13 11:32:00 - Maintenance Feature Design

### Decision
Designed a database schema (`maintenance_schedules` table) and an API endpoint (`GET /api/v1/maintenance/status`) for the 'under maintenance' feature. The design includes fields for start/end times, a display message, and an active configuration flag. The API will return the current maintenance status and relevant details.

### Rationale
To provide a mechanism for informing users when the application is undergoing scheduled maintenance, improving user experience during downtime. The design allows for pre-configuration of maintenance windows and a clear way for the frontend to query the status.

### Implementation Details
- **Database Table:** `maintenance_schedules` as defined in `docs/architecture/maintenance-feature-design.md`.
- **API Endpoint:** `GET /api/v1/maintenance/status` as defined in `docs/architecture/maintenance-feature-design.md`.
- Administrator interaction will be handled via direct database manipulation, as per user confirmation.

## 2025-10-29: API Key Authentication System Implementation

### Decision
Implemented a comprehensive API key authentication system for partner discount protection. The system uses bcrypt-hashed API keys stored in a new `api_keys` table, with optional middleware-based authentication and strict partner-payload validation.

### Rationale
Previously, anyone could use any `partnerId` in quote requests without authentication, creating a security vulnerability where unauthorized parties could claim partner discounts. The API key system ensures only authenticated partners can access their discounts while maintaining backward compatibility for non-partner requests.

### Implementation Details

**Phase 1 - Foundation:**
- Created `api_keys` table with migration `017-create-api-keys-table.ts`
- Fields: `id`, `partner_id`, `key_hash`, `key_prefix`, `name`, `last_used_at`, `expires_at`, `is_active`
- Indexes on `partner_id`, `key_prefix`, `is_active`, and composite `(is_active, key_prefix)`
- Created `ApiKey` model with Sequelize ORM
- Established Partner ↔ ApiKey associations (one-to-many)
- Added `bcrypt` and `@types/bcrypt` dependencies

**Phase 2 - Authentication Layer:**
- Implemented `apiKeyAuth.helpers.ts` with core functions:
  - `generateApiKey()`: Creates keys in format `vrtx_(live|test)_[32_chars]`
  - `hashApiKey()`: Bcrypt hashing with 10 salt rounds
  - `validateApiKey()`: Prefix-based lookup + bcrypt comparison
  - `isValidApiKeyFormat()`: Regex validation
  - `getKeyPrefix()`: Extracts first 8 characters for display/lookup
- Implemented `apiKeyAuth.ts` middleware:
  - `apiKeyAuth({ required, validatePartnerMatch })`: Main auth middleware
  - `enforcePartnerAuth()`: Validates partnerId match when present in payload
- Extended Express Request type with `authenticatedPartner` property

**Phase 3 - Admin Interface:**
- Created admin controller `admin/partnerApiKeys.controller.ts`:
  - `createApiKey()`: Generate and return new API key (shown only once)
  - `listApiKeys()`: List all keys for a partner (without raw keys)
  - `revokeApiKey()`: Soft delete by setting `isActive = false`
- Created admin routes `admin/partner-api-keys.route.ts`:
  - `POST /v1/admin/partners/:partnerId/api-keys`
  - `GET /v1/admin/partners/:partnerId/api-keys`
  - `DELETE /v1/admin/partners/:partnerId/api-keys/:keyId`
- Registered routes in main v1 router

**Phase 4 - Quote Integration:**
- Updated quote routes to include authentication middleware:
  - `apiKeyAuth({ required: false })`: Optional authentication
  - `enforcePartnerAuth()`: Required when `partnerId` in payload
- Authentication flow:
  - No API key + no partnerId → Continues normally (backward compatible)
  - No API key + partnerId → 403 Forbidden (auth required)
  - Valid API key + matching partnerId → Success with discount
  - Valid API key + mismatched partnerId → 403 Forbidden (partner mismatch)

### Security Features
- Bcrypt hashing (10 rounds) for API key storage
- Never store or retrieve raw API keys (shown once on creation)
- Prefix-based indexing reduces bcrypt operations
- Automatic `last_used_at` tracking
- Optional expiration dates
- Soft deletion (preserves audit trail)
- Constant-time comparison via bcrypt
- Environment separation (live/test keys)

### Key Format
- Pattern: `vrtx_(live|test)_[32_alphanumeric_chars]`
- Example: `vrtx_live_a7f3b2c9d1e4f5g6h7i8j9k0l1m2n3o4`
- 32 characters provide ~191 bits of entropy

### Authentication Header
- Uses `X-API-Key` header (not `Authorization`)
- Clearly distinguishes from future OAuth/JWT tokens

### Backward Compatibility
- All existing quote endpoints work without API keys
- Authentication only required when `partnerId` is specified
- No breaking changes to existing API consumers

### Error Responses
- `401 INVALID_API_KEY`: Invalid/expired/missing required key
- `403 AUTHENTICATION_REQUIRED`: partnerId without authentication
- `403 PARTNER_MISMATCH`: Authenticated partner ≠ payload partnerId

### Benefits
- Secures partner discount system
- Prevents unauthorized use of partner IDs
- Maintains backward compatibility
- Supports multiple keys per partner (rotation)
- Comprehensive audit trail
- Scalable architecture for future enhancements

## 2025-10-29: Admin Endpoint Protection

### Decision
Implemented Bearer token authentication for admin endpoints using an environment-based secret. The system uses constant-time comparison to prevent timing attacks and provides clear error messages for authentication failures.

### Rationale
Admin endpoints for API key management need protection to prevent unauthorized access. Using a simple Bearer token approach with an environment variable provides a secure, easy-to-manage solution suitable for internal team use.

### Implementation Details

**Files Created:**
- `apps/api/src/api/middlewares/adminAuth.ts` - Admin authentication middleware

**Files Modified:**
- `apps/api/src/config/vars.ts` - Added `adminSecret` configuration
- `apps/api/src/api/routes/v1/admin/partner-api-keys.route.ts` - Applied `adminAuth` middleware
- `apps/api/.env.example` - Documented `ADMIN_SECRET` environment variable

**Authentication Flow:**
1. Client sends request with `Authorization: Bearer <ADMIN_SECRET>` header
2. Middleware extracts and validates Bearer token format
3. Performs constant-time comparison against configured secret
4. Returns 401/403 on failure, proceeds on success

**Security Features:**
- Constant-time string comparison prevents timing attacks
- Clear separation between missing auth (401) and invalid token (403)
- Environment-based secret configuration
- No hardcoded credentials
- Detailed error messages for debugging

**Error Responses:**
- `401 ADMIN_AUTH_REQUIRED`: No Authorization header provided
- `401 INVALID_AUTH_FORMAT`: Malformed Authorization header
- `403 INVALID_ADMIN_TOKEN`: Token doesn't match configured secret
- `500 ADMIN_AUTH_NOT_CONFIGURED`: ADMIN_SECRET not set in environment

**Usage:**
```bash
# Generate a secure secret
openssl rand -base64 32

# Set in environment
export ADMIN_SECRET="your-generated-secret"

# Use in API calls
curl -H "Authorization: Bearer your-generated-secret" \
  https://api.example.com/v1/admin/partners/:partnerId/api-keys
```

### Benefits
- Protects sensitive admin operations
- Simple to configure and use
- Suitable for internal team access
- No additional authentication infrastructure needed
- Constant-time comparison enhances security
- Clear error messages aid debugging

## 2025-10-29: Environment-Based API Key Prefixes

### Decision
Updated API key generation to automatically use environment-appropriate prefixes based on the `SANDBOX_ENABLED` environment variable. Sandbox environments generate `vrtx_test_*` keys while production generates `vrtx_live_*` keys.

### Rationale
Distinguishing between sandbox and production API keys prevents accidental use of test keys in production and vice versa. The prefix provides immediate visual identification of the key's intended environment.

### Implementation Details

**Files Modified:**
- `apps/api/src/api/controllers/admin/partnerApiKeys.controller.ts` - Added environment detection
- `apps/api/.env.example` - Documented `SANDBOX_ENABLED` variable

**Key Generation Logic:**
```typescript
const environment = SANDBOX_ENABLED === "true" ? "test" : "live";
const apiKey = generateApiKey(environment);
```

**Key Formats:**
- **Production:** `vrtx_live_[32_random_chars]`
  - Example: `vrtx_live_a7f3b2c9d1e4f5g6h7i8j9k0l1m2n3o4`
- **Sandbox:** `vrtx_test_[32_random_chars]`
  - Example: `vrtx_test_a7f3b2c9d1e4f5g6h7i8j9k0l1m2n3o4`

**Environment Configuration:**
- `SANDBOX_ENABLED="true"` → Generates test keys
- `SANDBOX_ENABLED="false"` or unset → Generates live keys

### Benefits
- Clear visual distinction between environments
- Prevents accidental cross-environment key usage
- Aligns with existing sandbox configuration pattern
- No code changes needed to switch environments
- Follows industry best practices (e.g., Stripe's key format)

### Security Implications
- Both key types are validated identically
- Same security measures apply to both prefixes
- Validation accepts both formats in any environment
- Prevents test keys from being used in production workflows (if additional validation is added later)

## 2025-10-29: Partner Name-Based API Key Association

### Decision
Changed API key association from partner ID (one-to-one) to partner name (one-to-many). API keys are now created and validated based on the partner's `name` field, allowing a single key to work for all partner records with the same name (e.g., both BUY and SELL configurations).

### Rationale
Partners can have multiple records in the database - one for each ramp type (BUY/SELL). Previously, each record would need its own API key, which was cumbersome. By associating keys with the partner name instead of the specific record ID, a single API key works across all configurations for that partner.

### Implementation Details

**Database Schema Changes:**
- **Old:** `partner_id UUID` with foreign key to `partners(id)`
- **New:** `partner_name VARCHAR(100)` with no foreign key

**Migration:** `017-create-api-keys-table.ts`
- Removed `partnerId` field and foreign key constraint
- Added `partnerName` field (VARCHAR 100)
- Changed index from `idx_api_keys_partner_id` to `idx_api_keys_partner_name`

**Model Changes:** `apps/api/src/models/apiKey.model.ts`
- Changed `partnerId: string` to `partnerName: string`
- Removed Partner association (no foreign key)
- Added comment about manual matching

**Model Associations:** `apps/api/src/models/index.ts`
- Removed `Partner.hasMany(ApiKey)` and `ApiKey.belongsTo(Partner)`
- Added comment about manual matching via `partnerName`

**Controller Changes:** `apps/api/src/api/controllers/admin/partnerApiKeys.controller.ts`
- Routes now use `:partnerName` instead of `:partnerId`
- `createApiKey()`: Finds all partners with the given name, creates single key
- `listApiKeys()`: Returns keys for a partner name
- `revokeApiKey()`: Revokes key by name and ID
- Response includes `partnerCount` showing how many records share the key

**Authentication Helper:** `apps/api/src/api/middlewares/apiKeyAuth.helpers.ts`
- `validateApiKey()` now:
  1. Finds ApiKey by prefix
  2. Validates bcrypt hash
  3. Looks up Partner by `partnerName` field
  4. Returns first active partner found (any with that name)

**Route Changes:**
- Admin endpoints: `/v1/admin/partners/:partnerName/api-keys` (was `:partnerId`)
- Documentation updated to clarify name-based behavior

### Example Scenario

**Before (Partner ID-based):**
```
Partners Table:
- ID: uuid-1, name: "TestPartner", rampType: "BUY"
- ID: uuid-2, name: "TestPartner", rampType: "SELL"

API Keys Needed: 2 (one for each ID)
```

**After (Partner Name-based):**
```
Partners Table:
- ID: uuid-1, name: "TestPartner", rampType: "BUY"
- ID: uuid-2, name: "TestPartner", rampType: "SELL"

API Keys Needed: 1 (works for both records)
```

### API Usage

**Create Key:**
```bash
POST /v1/admin/partners/TestPartner/api-keys
# Creates one key that works for all "TestPartner" records
```

**Use Key:**
```bash
POST /v1/quotes
X-API-Key: vrtx_live_abc123...
{
  "partnerId": "uuid-1",  # Can be either BUY or SELL record
  ...
}
# System validates key matches partner name, not specific ID
```

### Benefits
- Simpler key management for partners with multiple configurations
- Single key for both BUY and SELL flows
- Cleaner admin interface (use names instead of UUIDs)
- Reduces number of keys needed
- More intuitive for partners

### Trade-offs
- No database-level referential integrity (no foreign key)
- Manual lookup required to find partners by name
- Slightly more complex validation logic
- Partner name changes would break API key association

### Migration Considerations
- Existing systems must regenerate API keys after migration
- Keys created before this change will not work
- Partner names must remain stable (don't change names)

## 2025-10-29: Public/Secret Key Architecture (Dual-Key System)

### Decision
Refactored the API key system from a single-key model to a dual-key architecture with public keys (pk_*) for tracking and secret keys (sk_*) for authentication. Public keys can be exposed client-side while secret keys remain server-only.

### Rationale
The single API key approach had limitations:
1. Keys needed to be kept secret, limiting client-side usage
2. No way to track quote origins without exposing secrets
3. Couldn't be used in URLs/widgets safely
4. Following industry standard (Stripe, PayPal) two-key pattern provides better security and flexibility

### Implementation Details

**Key Formats:**
- **Public Keys:** `pk_live_*` or `pk_test_*` (plaintext storage, can be exposed)
- **Secret Keys:** `sk_live_*` or `sk_test_*` (bcrypt hashed, server-only)

**Database Schema Changes:**
- Added `key_type` ENUM('public', 'secret') field
- Added `key_value` VARCHAR(255) for plaintext public keys
- Made `key_hash` nullable (only for secret keys)
- Updated indexes to include key_type
- Added `api_key` field to quote_tickets for tracking

**Models Updated:**
- `ApiKey`: Added keyType, keyValue fields
- `QuoteTicket`: Added apiKey field
- Both support the new dual-key structure

**Key Generation:**
- Admin creates both keys as a pair simultaneously
- Public key: Stored in plaintext (`keyValue`)
- Secret key: Bcrypt hashed and stored (`keyHash`)
- Environment-based prefixes (test/live)

**Usage Patterns:**

1. **Public Key (pk_*):**
   - Can be in request body or query params
   - Used for tracking which partner created quotes
   - Validates existence only
   - Stored on quote records
   - Applies partner discounts if valid
   - Can be exposed in JavaScript, URLs, widgets

2. **Secret Key (sk_*):**
   - Must be in X-API-Key header
   - Used for server-to-server authentication
   - Bcrypt validation
   - Required for high-risk operations
   - Never exposed client-side

**Middleware Architecture:**
- `validatePublicKey()`: Validates public keys (optional)
- `apiKeyAuth()`: Validates secret keys (optional, required for partnerId)
- `enforcePartnerAuth()`: Ensures secret key matches partnerId
- Both work together in quote flow

**Quote Flow:**
```typescript
POST /v1/quotes
{
  "apiKey": "pk_live_abc123...",  // Public key for tracking
  "partnerId": "PartnerName",     // Requires secret key in header
  ...
}
Headers:
  X-API-Key: sk_live_xyz789...    // Secret key for authentication
```

**Admin Endpoints:**
```typescript
POST /v1/admin/partners/:partnerName/api-keys
Response: {
  publicKey: { id, key: "pk_live_...", ... },
  secretKey: { id, key: "sk_live_...", ... }  // Shown only once!
}

GET /v1/admin/partners/:partnerName/api-keys
Response: {
  apiKeys: [
    { type: "public", key: "pk_live_...", ... },  // Full key shown
    { type: "secret", keyPrefix: "sk_live_", ... }  // Only prefix shown
  ]
}
```

**Security Model:**
- Public keys: Plaintext, indexed, can leak without security impact
- Secret keys: Bcrypt hashed, never retrievable, validated with constant-time comparison
- Both support expiration and soft deletion
- Both track last_used_at

**Migration Files:**
- `017-create-api-keys-table.ts`: Main api_keys table with dual-key support
- `018-add-api-key-to-quote-tickets.ts`: Adds tracking field to quotes

### Benefits
1. **Client-Side Safe:** Public keys can be used in JavaScript/URLs
2. **Quote Tracking:** Every quote can be attributed to a partner
3. **Widget Support:** Public keys enable iframe/widget integrations
4. **Analytics:** Track which integrations generate most quotes
5. **Security:** Secret keys protect high-value operations
6. **Industry Standard:** Follows Stripe/PayPal pattern
7. **Flexible:** Can use public key alone, or both together
8. **Backward Compatible:** Existing flows still work

### Use Cases
**Public Key Only:**
- Widget embeds
- Client-side quote generation
- Public integrations
- Tracking and analytics

**Secret Key Only:**
- Server-to-server with partnerId
- High-security operations
- Backend integrations

**Both Keys Together:**
- Full partner integration
- Quote tracking + authentication
- Discount application with audit trail

### Trade-offs
- More complex to manage (2 keys instead of 1)
- Public key exposure acceptable (by design)
- Need to educate partners on proper usage
- Both keys must be managed separately

### Security Guarantees
- Public key exposure: No security risk (expected behavior)
- Secret key exposure: Complete security breach (must protect)
- Secret keys never appear in logs, responses, or storage (except hash)
- Public keys fully auditable and trackable
