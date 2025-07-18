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
