# Decision Log

## 2025-04-25: Critical UI Portal Implementation

### Decision
Implemented a dedicated portal system (`CriticalUIPortal`) for critical UI elements (toasts, notifications, signing boxes) to ensure they appear above modal dialogs.

### Rationale
The native HTML `<dialog>` element, when used with `showModal()`, creates a top-layer rendering context that sits above all other elements regardless of their `z-index`. This caused toast notifications (`react-toastify`) and the `SigningBox` component to be hidden behind modal dialogs and their backdrops. Simply increasing the `z-index` of the toasts was insufficient due to the top-layer behavior.

### Implementation Details
1.  Created a reusable `CriticalUIPortal` component (`frontend/src/components/CriticalUIPortal/index.tsx`). This component dynamically creates a `div` with `id="critical-ui-portal"` and appends it to the end of the `document.body`. It uses `createPortal` to render its children into this container. Inline styles set a high `z-index` (10000) and `pointer-events: none` on the container, while a wrapper div inside enables pointer events for the actual content.
2.  Modified `frontend/src/app.tsx` to remove the original `<ToastContainer />` and instead render it inside the `<CriticalUIPortal>`.
3.  Updated `frontend/src/components/SigningBox/index.tsx` to wrap its output JSX within the `<CriticalUIPortal>` component.
4.  Added global CSS rules in `frontend/App.css` to ensure the dialog backdrop has a lower `z-index` than the portal and to correctly position the `ToastContainer` within the portal.

This portal-based approach ensures that critical UI elements are rendered later in the DOM structure and within a container explicitly managed to be on top, reliably overcoming the stacking limitations imposed by the native `<dialog>` element's top layer.


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
