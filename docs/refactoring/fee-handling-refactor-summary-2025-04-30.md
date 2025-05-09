# Fee Handling Refactoring Summary (2025-04-30)

## Overview

This document summarizes the refactoring applied to the fee calculation and handling logic within the ramp service, aligning it with the process detailed in `docs/architecture/ramp-journey-and-fees.md`. The primary goals were to improve accuracy, use database configurations, handle dynamic network fees, introduce a fee distribution phase, and ensure correct fee representation.

## Key Changes Implemented

1.  **Fee Sources & Calculation (`quote.service.ts`):**
    *   Vortex Foundation fee is now sourced from the `partners` table ('vortex_foundation' record).
    *   Anchor fees are sourced from `fee_configurations` (`feeType: 'anchor_base'`).
    *   Partner markup is sourced from the quote's specific partner record.
    *   The static `network_estimate` fee type was removed from `FeeConfiguration`.
    *   Network fees (`networkFeeUSD`) are now dynamically calculated in `calculateGrossOutputAndNetworkFee` (using a stub GLMR->USD rate for EVM on-ramps, '0' otherwise).
    *   All fee components (Network, Vortex, Anchor, Partner Markup) are calculated in USD.

2.  **Fee Representation & Storage (`quote.service.ts`, `quoteTicket.model.ts`):**
    *   A helper (`getTargetFiatCurrency`) determines the relevant fiat currency for the transaction (input for on-ramp, output for off-ramp).
    *   A placeholder function (`convertUSDtoTargetFiat`) converts the calculated USD fees into the target fiat currency.
    *   The `QuoteTicket.fee` field now stores the detailed fee breakdown denominated in the **target fiat currency**.
    *   The `QuoteTicket.metadata` field was enhanced to store `grossOutputAmount`, `anchorFeeFiat`, `distributableFeesFiat`, and `targetFiat` for use by downstream processes.

3.  **Final Output Calculation (`quote.service.ts`):**
    *   The final `outputAmount` (net amount user receives) is calculated by subtracting the **total USD fee** (converted to the *output currency* via the `convertFeeToOutputCurrency` placeholder) from the `grossOutputAmount`.

4.  **Transaction Preparation (`onrampTransactions.ts`, `offrampTransactions.ts`):**
    *   Logic was updated to use `grossOutputAmount` from metadata for pre-anchor amounts and swap minimums.
    *   On-ramp logic now calculates the input amount *after* the anchor fee deduction (using placeholder conversions `convertFiatToUSD` and `convertUSDToTokenUnits`).
    *   Final XCM transfers now use the final net `outputAmount` from the quote.

5.  **Fee Distribution Phase (`distribute-fees-handler.ts`):**
    *   Implements pre-signed transaction flow:
        - Transaction services (`onrampTransactions.ts`, `offrampTransactions.ts`) prepare and pre-sign batched fee distribution transactions
        - Transactions are stored in `state.presignedTxs` with `phase: 'distributeFees'`
    *   Distribution handler:
        - Retrieves transaction using `this.getPresignedTransaction(state, 'distributeFees')`
        - Submits pre-signed transaction rather than constructing locally
    *   Maintains existing fee destination logic:
        - Network and Vortex fees go to Vortex payout address
        - Partner fees go to Partner's payout address if applicable

6.  **State Machine Integration:**
    *   The `DistributeFeesHandler` was registered.
    *   Transitions were updated:
        *   On-Ramp: `nablaSwap` -> `distributeFees` -> `subsidizePostSwap` -> ...
        *   Off-Ramp: (EVM/AssetHub transfer) -> `distributeFees` -> `subsidizePreSwap` -> ...
    *   The `docs/architecture/ramp-journey-and-fees.md` document was updated to reflect the new on-ramp phase order.

7.  **Anchor Fee Handling:**
    *   Phase handlers interacting with anchors (`brlaTeleport`, `brlaPayoutOnMoonbeam`, `stellarPayment`) will use gross amounts. Subsequent phases handle the amount remaining after the anchor deducts its fee internally. No specific pre-adjustment logic was added to these handlers based on user clarification.

8.  **Cleanup:** Deleted `api/src/api/helpers/quote.ts`.

## Outstanding TODOs

- Change output currency from EURC to EUR
- Pass the partnerId to the backend when creating a quote
- Allow distinguishing between on/offramp
