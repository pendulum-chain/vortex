# Plan: Enhanced Fee Structure

**Date:** 2025-04-28

**Status:** Proposed

## 1. Overview

This document outlines the architectural changes required to enhance the fee structure within Pendulum Pay (Vortex). The current single `fee` field on `QuoteTicket` will be replaced with a granular breakdown including network fees, processing fees (Vortex Foundation + Anchor), and optional partner markups. Fees will be standardized to USD. Partner identification will be handled by passing a `partner_id` (UUID) in the quote request.

## 2. Database Schema Changes

### 2.1. `quote_tickets` Table (`api/src/models/quoteTicket.model.ts`)

*   **Remove:**
    *   `fee: DECIMAL(38, 18)`
*   **Add:**
    *   `network_fee: DECIMAL(38, 18)` - Estimated/actual cost of on-chain transactions.
    *   `processing_fee: DECIMAL(38, 18)` - Sum of Vortex Foundation + Anchor/Provider fees.
    *   `partner_markup_fee: DECIMAL(38, 18)` - Optional fee set by a partner (defaults to 0).
    *   `total_fee: DECIMAL(38, 18)` - Calculated sum: `network_fee + processing_fee + partner_markup_fee`.
    *   `fee_currency: STRING(8)` - Currency code for all fee fields (Default 'USD').
    *   `partner_id: UUID` - Nullable Foreign Key referencing `partners(id)`.

### 2.2. New `partners` Table

*   **Purpose:** Stores information about partners who can apply markups.
*   **Columns:**
    *   `id: UUID` (PK)
    *   `name: STRING` (Unique internal identifier, e.g., "PartnerX")
    *   `display_name: STRING` (User-facing name)
    *   `logo_url: STRING` (Optional)
    *   `markup_type: ENUM('absolute', 'relative', 'none')` (Default 'none')
    *   `markup_value: DECIMAL(10, 4)` (Amount for 'absolute' or percentage for 'relative')
    *   `markup_currency: STRING(8)` (Required if `markup_type` is 'absolute', should be 'USD')
    *   `payout_address: STRING` (Blockchain address for receiving collected fees)
    *   `is_active: BOOLEAN` (Default `true`)
    *   `created_at: TIMESTAMPTZ` (Default `NOW()`)
    *   `updated_at: TIMESTAMPTZ` (Default `NOW()`)

### 2.3. New `fee_configurations` Table

*   **Purpose:** Stores system-wide base fees and estimates.
*   **Columns:**
    *   `id: UUID` (PK)
    *   `fee_type: ENUM('vortex_foundation', 'anchor_base', 'network_estimate')`
    *   `identifier: STRING` (Optional context, e.g., network name 'polygon', anchor name 'moonbeam_brla', 'default')
    *   `value_type: ENUM('absolute', 'relative')`
    *   `value: DECIMAL(10, 4)`
    *   `currency: STRING(8)` (Should be 'USD')
    *   `is_active: BOOLEAN` (Default `true`)
    *   `created_at: TIMESTAMPTZ` (Default `NOW()`)
    *   `updated_at: TIMESTAMPTZ` (Default `NOW()`)
*   **Initial Data:**
    *   Add entry for static 1 USD network fee: `{ fee_type: 'network_estimate', identifier: 'default', value_type: 'absolute', value: 1.00, currency: 'USD' }`.
    *   Add entries for the Vortex Foundation fee (e.g., relative 0.1%).
    *   Add entries for base anchor fees per relevant integration (e.g., absolute fee for BRLA anchor).

## 3. Backend Logic (`api/src/api/services/ramp/quote.service.ts`)

*   **Partner Identification:**
    *   Expect an optional `partner_id` (UUID) in the `/v1/ramp/quotes` request payload (body or query parameter).
    *   If `partner_id` is provided, validate it against the `partners` table. Check if the partner `is_active`.
    *   If valid and active, store the `partner_id`; otherwise, treat as null.
*   **Fee Calculation (Standardized to USD):**
    1.  **Partner Markup Fee:** If a valid `partner_id` was identified, fetch the partner's `markup_type` and `markup_value`. Calculate the fee based on the quote amount (if relative) or use the absolute value. Ensure the result is in USD. Default to 0 if no valid partner.
    2.  **Processing Fee:** Fetch the active `vortex_foundation` fee configuration. Fetch the active `anchor_base` fee configuration relevant to the current quote context (e.g., based on the specific anchor/provider involved). Sum these values (ensure both are in USD).
    3.  **Network Fee:** Fetch the active `network_estimate` fee configuration with `identifier: 'default'`. Use its value (1.00 USD).
    4.  **Total Fee:** Sum `partner_markup_fee + processing_fee + network_fee`.
*   **Save Quote:** Persist the calculated `network_fee`, `processing_fee`, `partner_markup_fee`, `total_fee`, `fee_currency: 'USD'`, and the validated `partner_id` (or null) to the `quote_tickets` table record.

## 4. API & Documentation

*   **API DTOs (`shared/src/endpoints/quote.endpoints.ts`):**
    *   Modify the request DTO for `/v1/ramp/quotes` to accept an optional `partner_id: string` (UUID format).
    *   Modify the response DTO for `/v1/ramp/quotes` to return the fee breakdown: `network_fee: string`, `processing_fee: string`, `partner_markup_fee: string`, `total_fee: string`, `fee_currency: string`.
*   **Memory Bank:** Update `decisionLog.md`, `activeContext.md`, and `systemPatterns.md` to reflect these decisions.

## 5. Diagram: Fee Calculation Flow

```mermaid
graph TD
    subgraph API Layer
        R[Incoming Request w/ partnerId?] --> A[QuoteService];
    end

    subgraph QuoteService
        A --> B{Check for partnerId in Request};
        B -- partnerId exists --> VLD[Validate Partner ID in DB];
        VLD -- Valid --> C[Fetch Partner Config from DB];
        VLD -- Invalid/Not Found --> D[Markup = 0, partnerId = null];
        B -- No partnerId --> D;
        C --> E[Calculate Partner Markup Fee (USD)];
        D --> F[Fetch Base Fees (Vortex, Anchor) from DB];
        E --> F;
        F --> G[Fetch Static Network Fee (1 USD) from DB];
        G --> H[Calculate Total Fee (USD)];
        H --> J[Save QuoteTicket w/ Fee Breakdown (USD) & partnerId];
    end

    subgraph Database
        K[(partners)];
        L[(fee_configurations)];
        N[(quote_tickets)];
    end

    VLD --> K;
    C --> K;
    F --> L;
    G --> L;
    J --> N;

    style K fill:#f9f,stroke:#333,stroke-width:2px
    style L fill:#f9f,stroke:#333,stroke-width:2px
    style N fill:#f9f,stroke:#333,stroke-width:2px
```

## 6. Next Steps

*   Implement database migrations for new tables and modifications.
*   Update Sequelize models (`quoteTicket.model.ts`, create `partner.model.ts`, `feeConfiguration.model.ts`).
*   Update `QuoteService` logic.
*   Update API DTOs.
*   Update Memory Bank files.
*   (Handover to Code Mode) Implement frontend changes to pass `partner_id` and display fee breakdown.
