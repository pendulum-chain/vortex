# Ramp Journey and Fee Application

This document outlines the step-by-step process (journey) for both on-ramp (fiat-to-crypto) and off-ramp (crypto-to-fiat) transactions within the system, detailing when and how fees are applied.

## Fee Calculation and Application (Target State Post-Refactor)

Fees are a crucial part of the ramp process. The following describes the intended fee structure after the ongoing refactoring is complete:

1.  **Calculation Point:** All fees are calculated and factored in during the **quote generation phase** (`api/src/api/services/ramp/quote.service.ts`). The final output amount shown to the user in the quote reflects the total fee impact.
2.  **Fee Source:** Fee parameters and logic are sourced entirely from the **database**, specifically the `FeeConfiguration` and `Partner` tables. Token configuration files in the `shared` module will no longer be used for fee definitions.
3.  **Fee Components:** The total fee is composed of several parts, calculated initially in USD:
    *   **`network` Fee:** Aims to cover the estimated on-chain transaction costs (e.g., gas, XCM, Stellar fees) required for the entire ramp process. The exact calculation logic is determined within `calculateGrossOutputAndNetworkFee`.
    *   **`vortex` Fee:** The platform fee, defined by the `vortex_foundation` record in the `Partner` table (can be absolute or relative).
    *   **`anchor` Fee:** The fee charged by the specific fiat anchor service involved (e.g., BRLA, Stellar EURC anchor). This is sourced from the `FeeConfiguration` table based on `feeType: 'anchor_base'` and an identifier matching the anchor (e.g., `moonbeam_brla`). Can be absolute, relative, or a combination.
    *   **`partnerMarkup` Fee:** An optional additional fee applied by an external partner integrating with the ramp service, defined in their specific `Partner` table record (can be absolute or relative).
4.  **Application Logic:**
    *   The individual fee components (`network`, `vortex`, `anchor`, `partnerMarkup`) are calculated in USD.
    *   They are summed to get a `totalFeeUSD`.
    *   This `totalFeeUSD` is then converted to the **output currency** of the ramp (using appropriate exchange rate logic, currently placeholder).
    *   The converted total fee is subtracted from the `grossOutputAmount` (the amount calculated *after* the core swap/exchange but *before* fees) to determine the final net amount the user will receive or the final crypto amount delivered.
5.  **Fee Display:** The fee breakdown (`FeeStructure`) shown to the user in the quote response is presented in the relevant **fiat currency** for the transaction (e.g., BRL, EUR, ARS), converted from the initial USD calculations.

## Ramp Journeys

The ramp process is managed by a state machine, transitioning through various phases handled by dedicated services.

**Common Initial Steps:**

1.  **Quote Request:** User requests a quote (`quote.service.ts`). Fees are calculated and applied as described above.
2.  **Register Ramp:** User accepts the quote. The system validates the quote, prepares necessary unsigned transactions based on the fee-adjusted amounts, and creates a `RampState` record (`ramp.service.ts`). The initial phase is set to `initial`.
3.  **Start Ramp:** User signs transactions client-side and submits them. The system validates signatures, updates the `RampState`, and triggers the `phaseProcessor` (`ramp.service.ts`).
4.  **Phase: `initial` (`initial-phase-handler.ts`):** Checks for signed transactions (off-ramp). If Stellar is involved, submits the pre-signed `stellarCreateAccount` transaction. Transitions to `fundEphemeral`.
5.  **Phase: `fundEphemeral` (`fund-ephemeral-handler.ts`):** Checks and funds the required Pendulum and/or Moonbeam ephemeral accounts with small amounts of native tokens (PEN, GLMR) to cover transaction fees for subsequent steps. Transitions based on ramp type and source/destination.

---

### On-Ramp Journey (Fiat BRL -> Crypto on EVM/AssetHub)

*   **Starts After:** `fundEphemeral`
*   **Next Phase:** `brlaTeleport`

6.  **Phase: `brlaTeleport` (`brla-teleport-handler.ts`):**
    *   Interacts with BRLA services to request the transfer of the input BRL amount (already fee-adjusted) to the Moonbeam ephemeral address.
    *   Polls Moonbeam until the corresponding BRLA ERC20 tokens arrive.
    *   Transitions to `moonbeamToPendulumXcm`.
7.  **Phase: `moonbeamToPendulumXcm` (`moonbeam-to-pendulum-xcm-handler.ts`):**
    *   Submits the pre-signed XCM transaction to transfer the BRLA tokens from the Moonbeam ephemeral address to the Pendulum ephemeral address.
    *   Waits for the BRLA tokens to arrive on Pendulum.
    *   Transitions to `subsidizePreSwap`.
8.  **Phase: `subsidizePreSwap` (`subsidize-pre-swap-handler.ts`):**
    *   Checks the BRLA balance on the Pendulum ephemeral address.
    *   If slightly less than expected (due to minor XCM fees/dust), tops it up from a funding account to match the exact `inputAmountBeforeSwapRaw`.
    *   Transitions to `nablaApprove`.
9.  **Phase: `nablaApprove` (`nabla-approve-handler.ts`):**
    *   Submits the pre-signed transaction to approve the Nabla AMM router contract to spend the BRLA from the Pendulum ephemeral address.
    *   Transitions to `nablaSwap`.
10. **Phase: `nablaSwap` (`nabla-swap-handler.ts`):**
    *   Gets a live quote from the Nabla AMM.
    *   Checks against slippage tolerance (`nablaSoftMinimumOutputRaw`).
    *   Submits the pre-signed transaction to execute the swap (e.g., BRLA -> USDC) on Pendulum.
    *   Transitions to `subsidizePostSwap`.
11. **Phase: `subsidizePostSwap` (`subsidize-post-swap-handler.ts`):**
    *   Checks the balance of the *output crypto asset* (e.g., USDC) on the Pendulum ephemeral address.
    *   If slightly less than expected (due to AMM fees), tops it up from a funding account to match the exact `outputAmountBeforeFees`.
    *   Transitions to `pendulumToMoonbeam` (for EVM destination) or `pendulumToAssethub` (for AssetHub destination).

**Final Delivery (On-Ramp):**

12. **Path A (EVM Destination):**
    *   **Phase: `pendulumToMoonbeam` (`pendulum-moonbeam-phase-handler.ts`):** Submits XCM transaction to send the final crypto asset from Pendulum ephemeral to Moonbeam ephemeral. Transitions to `squidrouterSwap`.
    *   **Phase: `squidrouterSwap` (`squid-router-phase-handler.ts`):** Submits pre-signed Approve and Swap transactions interacting with Squid Router on Moonbeam to bridge/swap the asset to the user's final destination address on the target EVM chain. Transitions to `complete`.
13. **Path B (AssetHub Destination):**
    *   **Phase: `pendulumToAssethub` (`pendulum-to-assethub-phase-handler.ts`):** Submits XCM transaction to send the final crypto asset from Pendulum ephemeral directly to the user's final destination address on AssetHub. Transitions to `complete`.

14. **Phase: `complete` (`complete-phase-handler.ts`):** Terminal state. Marks the ramp as finished.

---

### Off-Ramp Journey (Crypto -> Fiat BRL)

*   **Starts After:** `fundEphemeral`
*   **Next Phase:** `moonbeamToPendulum` (if starting on EVM) or `subsidizePreSwap` (if starting on AssetHub). Assuming EVM start for this example.

6.  **Phase: `moonbeamToPendulum` (`moonbeam-to-pendulum-handler.ts`):** (Handles transfer if starting asset is on Moonbeam/EVM) Submits XCM to move the input crypto asset to the Pendulum ephemeral address. Transitions to `subsidizePreSwap`.
7.  **Phase: `subsidizePreSwap` (`subsidize-pre-swap-handler.ts`):**
    *   Checks the input crypto asset balance on the Pendulum ephemeral address.
    *   Tops up if necessary.
    *   Transitions to `nablaApprove`.
8.  **Phase: `nablaApprove` (`nabla-approve-handler.ts`):**
    *   Submits pre-signed approval for Nabla swap.
    *   Transitions to `nablaSwap`.
9.  **Phase: `nablaSwap` (`nabla-swap-handler.ts`):**
    *   Gets live quote, checks slippage.
    *   Submits pre-signed swap (e.g., USDC -> BRLA wrapper) on Pendulum.
    *   Transitions to `subsidizePostSwap`.
10. **Phase: `subsidizePostSwap` (`subsidize-post-swap-handler.ts`):**
    *   Checks the BRLA wrapper balance on Pendulum ephemeral.
    *   Tops up if necessary to match `outputAmountBeforeFees`.
    *   Transitions to `pendulumToMoonbeam`.
11. **Phase: `pendulumToMoonbeam` (`pendulum-moonbeam-phase-handler.ts`):**
    *   Submits XCM transaction to send the BRLA wrapper from Pendulum ephemeral to the designated BRLA payout address on Moonbeam/Polygon.
    *   Transitions to `brlaPayoutOnMoonbeam`.
12. **Phase: `brlaPayoutOnMoonbeam` (`brla-payout-moonbeam-handler.ts`):**
    *   Waits for BRLA tokens to arrive at the payout address on Polygon.
    *   Calls BRLA API (`triggerOfframp`) providing user's tax ID, destination PIX key, receiver tax ID, and the final BRL amount (post-swap amount, which already had off-ramp fees deducted during quote). This initiates the PIX transfer to the user.
    *   Transitions to `complete`.
13. **Phase: `complete` (`complete-phase-handler.ts`):** Terminal state.

---

### Off-Ramp Journey (Crypto -> Fiat via Stellar, e.g., EURC)

*   **Starts After:** `fundEphemeral`
*   **Next Phase:** `moonbeamToPendulum` (if starting on EVM) or `subsidizePreSwap` (if starting on AssetHub). Assuming EVM start for this example.

6.  **Phase: `moonbeamToPendulum` (`moonbeam-to-pendulum-handler.ts`):** (Handles transfer if starting asset is on Moonbeam/EVM) Submits XCM to move the input crypto asset to the Pendulum ephemeral address. Transitions to `subsidizePreSwap`.
7.  **Phase: `subsidizePreSwap` (`subsidize-pre-swap-handler.ts`):**
    *   Checks input crypto balance on Pendulum ephemeral.
    *   Tops up if necessary.
    *   Transitions to `nablaApprove`.
8.  **Phase: `nablaApprove` (`nabla-approve-handler.ts`):**
    *   Submits pre-signed approval for Nabla swap.
    *   Transitions to `nablaSwap`.
9.  **Phase: `nablaSwap` (`nabla-swap-handler.ts`):**
    *   Gets live quote, checks slippage.
    *   Submits pre-signed swap (e.g., USDC -> wrapped EURC) on Pendulum.
    *   Transitions to `subsidizePostSwap`.
10. **Phase: `subsidizePostSwap` (`subsidize-post-swap-handler.ts`):**
    *   Checks wrapped EURC balance on Pendulum ephemeral.
    *   Tops up if necessary to match `outputAmountBeforeFees`.
    *   Transitions to `spacewalkRedeem`.
11. **Phase: `spacewalkRedeem` (`spacewalk-redeem-handler.ts`):**
    *   Submits the pre-signed Spacewalk redeem request transaction on Pendulum.
    *   Waits for the `RedeemExecute` event from the Spacewalk pallet, confirming the corresponding Stellar asset (EURC) has been released to the Stellar ephemeral account.
    *   Transitions to `stellarPayment`.
12. **Phase: `stellarPayment` (`stellar-payment-handler.ts`):**
    *   Submits the pre-signed Stellar transaction. This transaction sends the final fiat amount (EURC, which already had off-ramp fees deducted during quote) from the Stellar ephemeral account to the user's final destination Stellar address.
    *   Transitions to `complete`.
13. **Phase: `complete` (`complete-phase-handler.ts`):** Terminal state.
