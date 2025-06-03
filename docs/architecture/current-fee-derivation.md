# Current Fee Derivation Logic in Vortex Quote Calculation

This document explains the current fee calculation process implemented in the Vortex quote system, focusing on how fees impact the final quote amount.

## Overview

Fees currently impact the final quote amount via helper functions applied during the `calculateOutputAmount` process in `api/src/api/services/ramp/quote.service.ts`. While the `calculateFeeComponents` function is called and its results are stored in the database and API response, the **actual** fees affecting the transaction amounts are calculated separately through the helper functions `calculateTotalReceiveOnramp` and `calculateTotalReceive`.

## Fee Source

Fee parameters are sourced from Fiat token details within the `shared` module via the `getAnyFiatTokenDetails` function. These parameters include:

- `onrampFeesBasisPoints`: Percentage-based fee for on-ramp transactions (in basis points, where 100 = 1%)
- `onrampFeesFixedComponent`: Fixed fee amount for on-ramp transactions
- `offrampFeesBasisPoints`: Percentage-based fee for off-ramp transactions (in basis points)
- `offrampFeesFixedComponent`: Fixed fee amount for off-ramp transactions

These parameters are defined in the token configuration files:
- `shared/src/tokens/moonbeam/config.ts` for BRL
- `shared/src/tokens/stellar/config.ts` for ARS and EURC

## On-Ramp Fee Application

For on-ramp transactions (fiat to crypto), the `calculateTotalReceiveOnramp` function is used when the input currency is a fiat currency:

```javascript
export function calculateTotalReceiveOnramp(fromAmount: Big, inputCurrency: RampCurrency): string {
  if (isFiatToken(inputCurrency)) {
    const inputTokenDetails = getAnyFiatTokenDetails(inputCurrency);
    const feeBasisPoints = inputTokenDetails.onrampFeesBasisPoints;
    const fixedFees = new Big(
      inputTokenDetails.onrampFeesFixedComponent ? inputTokenDetails.onrampFeesFixedComponent : 0,
    );
    const fees = fromAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(6, 0);
    const totalReceiveRaw = fromAmount.minus(fees);

    if (totalReceiveRaw.gt(0)) {
      return totalReceiveRaw.toFixed(6, 0);
    }
    return '0';
  }
}
```

Key points:
- Fees are calculated based on the original `inputAmount`
- Both percentage-based fees (basis points) and fixed component fees are applied
- Fees are deducted from the input amount **before** the core swap logic (`getTokenOutAmount`)
- The resulting `inputAmountAfterFees` is what gets processed through the swap

## Off-Ramp Fee Application

For off-ramp transactions (crypto to fiat), the `calculateTotalReceive` function is used when the output currency is a fiat currency:

```javascript
export function calculateTotalReceive(toAmount: Big, outputCurrency: RampCurrency): string {
  if (isFiatToken(outputCurrency)) {
    const outputTokenDetails = getAnyFiatTokenDetails(outputCurrency);
    const feeBasisPoints = outputTokenDetails.offrampFeesBasisPoints;
    const fixedFees = new Big(
      outputTokenDetails.offrampFeesFixedComponent ? outputTokenDetails.offrampFeesFixedComponent : 0,
    );
    const fees = toAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(2, 1);
    const totalReceiveRaw = toAmount.minus(fees);

    if (totalReceiveRaw.gt(0)) {
      return totalReceiveRaw.toFixed(2, 0);
    }
    return '0';
  }
}
```

Key points:
- Fees are calculated based on the amount **after** the core swap logic (`getTokenOutAmount`)
- Both percentage-based fees (basis points) and fixed component fees are applied
- Fees are deducted from the swap result to determine the final amount the user receives

## "Effective Fees" Display

The `calculateOutputAmount` function calculates and returns an `effectiveFees` value that represents the total fee impact:

```javascript
const effectiveFeesOfframp = amountOut.preciseQuotedAmountOut.preciseBigDecimal
  .minus(outputAmountAfterFees)
  .toFixed(2, 0);

const effectiveFeesOnrampBrl = new Big(inputAmount).minus(inputAmountAfterFees);
const effectiveFeesOnramp = effectiveFeesOnrampBrl.mul(amountOut.effectiveExchangeRate).toFixed(6, 0);
const effectiveFees = rampType === 'off' ? effectiveFeesOfframp : effectiveFeesOnramp;
```

This calculation differs depending on the ramp type:
- For off-ramp: It's the difference between the raw swap output and the final amount after fees
- For on-ramp: It's the input amount fees converted to the output currency using the effective exchange rate

## Discrepancy with `calculateFeeComponents`

The `calculateFeeComponents` function is called within `createQuote` and its results are stored in the database and API response. However, **this logic does not currently determine the actual fees deducted from the transaction amount**.

The fee components calculated by this function (network fee, processing fee, partner markup fee) are based on the `FeeConfiguration` database table and partner settings, but they are only used for display and record-keeping purposes. The actual fee deduction that impacts the user's final amount is determined by the `calculateTotalReceiveOnramp` and `calculateTotalReceive` functions using the fee parameters from the token configuration.

This discrepancy suggests a partially implemented refactor or an intended future state where the fee configuration from the database would drive the actual fee calculations.
