import Big from "big.js";

type BigSource = string | number | Big;

interface PostSwapSubsidyComponentsInput {
  currentBalanceRaw: BigSource;
  discountSubsidyAmountRaw: BigSource;
  expectedOutputAmountRaw: BigSource;
  quotedActualOutputAmountRaw?: BigSource;
}

export interface PostSwapSubsidyComponents {
  discountAmountRaw: Big;
  discrepancyAmountRaw: Big;
  requiredAmountRaw: Big;
}

function positive(value: Big): Big {
  return value.gt(0) ? value : Big(0);
}

function minBig(a: Big, b: Big): Big {
  return a.lt(b) ? a : b;
}

export function calculatePostSwapSubsidyComponents({
  currentBalanceRaw,
  discountSubsidyAmountRaw,
  expectedOutputAmountRaw,
  quotedActualOutputAmountRaw
}: PostSwapSubsidyComponentsInput): PostSwapSubsidyComponents {
  const currentBalance = Big(currentBalanceRaw);
  const expectedOutputAmount = Big(expectedOutputAmountRaw);
  const discountSubsidyAmount = positive(Big(discountSubsidyAmountRaw));
  const quotedActualOutputAmount =
    quotedActualOutputAmountRaw === undefined
      ? expectedOutputAmount.minus(discountSubsidyAmount)
      : Big(quotedActualOutputAmountRaw);

  const requiredAmountRaw = positive(expectedOutputAmount.minus(currentBalance));
  const discrepancyBaselineRaw = minBig(positive(quotedActualOutputAmount), expectedOutputAmount);
  const discrepancyAmountRaw = positive(discrepancyBaselineRaw.minus(currentBalance));

  return {
    discountAmountRaw: positive(requiredAmountRaw.minus(discrepancyAmountRaw)),
    discrepancyAmountRaw,
    requiredAmountRaw
  };
}
