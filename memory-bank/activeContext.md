# Active Context: Pendulum Pay Backend Migration

## Current Work Focus

We are currently focused on migrating the on-ramping and off-ramping logic from the frontend to the backend. This
involves:

1. Creating a PostgreSQL database schema for storing ramping state
2. Implementing a state machine for handling ramping flows
3. Developing API endpoints for quotes and ramping processes
4. Setting up background workers for cleanup tasks

The goal is to make the ramping process more resilient by storing state in a database and allowing the backend to handle
the flow progression, while still keeping the security benefits of having transactions signed on the frontend.

## Recent Changes

1. **Database Integration**

   - Added PostgreSQL connection configuration
   - Created models for quote tickets, ramp states, and idempotency keys
   - Implemented database migrations using Umzug

2. **API Endpoints**

   - Created `/v1/ramp/quotes` endpoints for quote generation
   - Added `/v1/ramp/start` for initiating ramping processes
   - Implemented `/v1/ramp/:id` for status polling
   - Added endpoints for phase and state updates

3. **Service Layer**

   - Implemented base service with common functionality
   - Created quote service for handling quote generation
   - Developed ramp service for managing ramping processes
   - Added validation for presigned transactions

4. **Background Processing**
   - Added cleanup worker for expired quotes and idempotency keys

## Next Steps

0. **Implement Enhanced Fee Structure**
   - Create database migrations for `partners` and `fee_configurations` tables.
   - Modify `quote_tickets` table migration/model.
   - Update `QuoteService` logic for new fee calculation.
   - Update API DTOs.

1. **Frontend Integration**

   - Implement status polling for ramping processes
   - *(Deferred)* Modify transaction signing process (if needed for fee changes)
   - *(Deferred)* Pass `partner_id` in quote requests
   - *(Deferred)* Display fee breakdown in UI

2. **Testing**

   - Create unit tests for the new services (including fee logic)
   - Develop integration tests for the API endpoints (including fee calculation)
   - Test the ramping flows end-to-end (including partner markup scenarios)

3. **Deployment**

   - Set up PostgreSQL database in production
   - Deploy the updated backend
   - Monitor the system for any issues

4. **Documentation**
   - Update API documentation (including new fee structure and `partner_id` parameter)
   - Create developer guides for the new endpoints
   - Document the database schema and migration process (including new tables)

## Active Decisions and Considerations

1. **Security Model**

   - We decided to keep the security model where private keys are never stored on the backend
   - The frontend will continue to create ephemeral accounts and pre-sign transactions
   - The backend will store and execute these presigned transactions at the appropriate phases

2. **State Machine Design**

   - We chose to implement the ramping flows as state machines with distinct phases
   - Each phase has a clear entry and exit point
   - The system can recover from crashes by checking the current phase and continuing from there

3. **Quote Expiration**

   - Quotes will expire after 10 minutes to ensure price accuracy
   - A background worker will clean up expired quotes
   - The frontend will need to request a new quote if the old one expires

4. **Idempotency**
   - We implemented idempotency keys to prevent duplicate operations
   - Keys are stored in the database and expire after 24 hours

5. **Fee Structure Enhancement (Design Finalized)**
   - Decided to replace the single `fee` in `QuoteTicket` with `network_fee`, `processing_fee`, `partner_markup_fee`, `total_fee` (all in USD).
   - Introduced `partners` table for partner-specific markup rules.
   - Introduced `fee_configurations` table for system fees (Vortex, Anchor, Network Estimate).
   - Partner identification will use `partner_id` (UUID) passed in the quote request.
   - Network fee initially set to a static 1 USD estimate.
   - See `docs/architecture/fee-enhancement-plan.md` for full details.


## Frontend Context (Vortex - Based on Codebase Analysis)

**Current Focus:**
- Implementing the core swap functionality (`SwapPage`, `Swap` component).
- Integrating multi-network support (EVM chains + AssetHub) via `NetworkSelector` and context providers.
- Handling wallet connections for both EVM (`@reown/appkit`, Wagmi) and Polkadot (`@talismn/connect-wallets`).
- Developing UI sections for the landing/information page (`PitchSection`, `TrustedBy`, `WhyVortex`, etc.).
- Implementing specific flows like BRLA KYC (`BrlaComponents`) and user feedback (`Rating`).
- Managing application state using Zustand stores (`formStore`, `offrampStore`, `sep24Store`) and React Context.

**Recent Changes (Inferred from Codebase):**
- Addition of BRLA-specific KYC form components.
- Implementation of a user rating component.
- Creation of various informational sections for the main page.
- Integration of Sentry for error reporting and Google Tag Manager for analytics.
- Setup of multiple wallet connection providers.
- Use of custom hooks for balance fetching, signing, and account abstraction (`useOnchainTokenBalance`, `useSignChallenge`, `useVortexAccount`).

**Inferred Next Steps:**
- Integrate frontend swap logic with the backend API endpoints (Quote, Ramp Start, Status Polling).
- Refine and test the BRLA KYC flow integration.
- Complete implementation of transaction state handling based on backend responses.
- Add comprehensive unit and integration tests.
- **(New)** Update quote request to include optional `partner_id`.
- **(New)** Update UI to display fee breakdown from quote response.

**Open Questions/Issues (Inferred):**
- How is the frontend state kept in sync with the backend's state machine during the ramp process?
- What is the detailed error handling strategy for backend API failures?
- What is the current test coverage status?

[2025-04-04 16:47:04] - Added frontend context based on codebase analysis.
   - The frontend can use these keys to safely retry operations
[2025-04-28 19:27:00] - Updated with Fee Structure Enhancement plan. Added as next step and active decision. Adjusted frontend next steps.
