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
    *   A new `DistributeFeesHandler` was created.
    *   It reads the fiat-denominated Network, Vortex, and Partner fees from `quote.fee`.
    *   It converts these back to USD (placeholder) and then to stablecoin units (placeholder, assuming axlUSDC).
    *   It transfers the calculated stablecoin amounts from the Pendulum ephemeral account to the Vortex payout address (for Network and Vortex fees) and the Partner's payout address (if applicable).
    *   Network fee destination is currently set to the Vortex payout address.

6.  **State Machine Integration:**
    *   The `DistributeFeesHandler` was registered.
    *   Transitions were updated:
        *   On-Ramp: `nablaSwap` -> `distributeFees` -> `subsidizePostSwap` -> ...
        *   Off-Ramp: (EVM/AssetHub transfer) -> `distributeFees` -> `subsidizePreSwap` -> ...
    *   The `docs/architecture/ramp-journey-and-fees.md` document was updated to reflect the new on-ramp phase order.

7.  **Anchor Fee Handling:**
    *   Phase handlers interacting with anchors (`brlaTeleport`, `brlaPayoutOnMoonbeam`, `stellarPayment`) will use gross amounts. Subsequent phases handle the amount remaining after the anchor deducts its fee internally. No specific pre-adjustment logic was added to these handlers based on user clarification.

8.  **Cleanup:** Deleted `api/src/api/helpers/quote.ts`.

## Outstanding TODOs / Placeholders

*   Implement real price feed logic in placeholder conversion functions:
    *   `convertFeeToOutputCurrency` (`quote.service.ts`)
    *   `convertUSDtoTargetFiat` (`quote.service.ts`)
    *   `convertFiatToUSD` (`onrampTransactions.ts`, `distribute-fees-handler.ts`)
    *   `convertUSDToTokenUnits` (`onrampTransactions.ts`, `distribute-fees-handler.ts`)
    *   For this, we should implement a price-fetching that caches the prices as we'll always have a need for the same prices for each ramp. The caching could work so that a new price for a respective token is only queried if the last price was older than 5 minutes. The price-query service shouldn't poll the price periodically but only when a new quote is created and the cache is stale. 
    * For the time being, this service would only need to query Coingecko for the Moonbeam GLMR price. The price of the fiat-token -> USD can be determined based on our swap pool rate. It cannot get queried from Coingecko.
*   Replace hardcoded GLMR->USD rate (0.08) in `calculateGrossOutputAndNetworkFee` (`quote.service.ts`) with dynamic price fetching.
*   Finalize the Network fee payout address configuration in `DistributeFeesHandler`.
*   Refine stablecoin selection logic in `DistributeFeesHandler`.
*   Add validation for `targetFiat` currency identification in `getTargetFiatCurrency` (`quote.service.ts`).
*   Change the logic of the `distribute-fees-handler.ts` so that it's also using presigned transactions. The have to be added to `onrampingTransactions.ts` and `offrampingTransactions.ts` and the handler itself should only submit the transactino but not sign.
    *   This means that we need to make sure that the exchange rates/prices from USD to the relevant currencies (e.g. GLMR) are only used once when creating the presigned transactions. The distribute-fees handler doesn't need to fetch those prices again.
