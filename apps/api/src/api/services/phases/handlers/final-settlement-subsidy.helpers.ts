import Big from "big.js";

/**
 * How much output token must be subsidized into the ephemeral so it can settle `expectedAmountRaw`.
 *
 * Primary figure: `expected - delivered`, where `delivered` is measured against the pre-swap
 * `preSettlementBalance` snapshot taken in the squidRouter phase.
 *
 * Clamp: never more than the true on-chain shortfall `expected - actualBalance`. The ephemeral
 * already holds `actualBalance`, so it can never need more than that to reach `expected`. This
 * guards against a mis-timed snapshot (e.g. a same-chain synchronous swap whose output was already
 * captured in `preSettlementBalance`, making `delivered` read ~0) from funding a second full output.
 *
 * May return a value <= 0, meaning no subsidy is needed.
 */
export function computeSubsidyRaw(expectedAmountRaw: Big, delivered: Big, actualBalance: Big): Big {
  const deliveredBased = expectedAmountRaw.minus(delivered);
  const onChainShortfall = expectedAmountRaw.minus(actualBalance);
  return deliveredBased.gt(onChainShortfall) ? onChainShortfall : deliveredBased;
}
