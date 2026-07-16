export interface UsdcToBrlaAmountSelection {
  amountUsdc: string;
  reason: "manual" | "standard" | "profitable";
}

export interface EvaluatedUsdcToBrlaAmount {
  amountUsdc: string;
  projectedProfitable: boolean;
}

export function selectUsdcToBrlaAmount(
  standardAmount: string,
  profitableAmount: string,
  isProfitableAmountProjectedProfitable: boolean,
  manualAmount: string | null
): UsdcToBrlaAmountSelection {
  if (manualAmount) return { amountUsdc: manualAmount, reason: "manual" };

  if (isProfitableAmountProjectedProfitable) return { amountUsdc: profitableAmount, reason: "profitable" };

  return { amountUsdc: standardAmount, reason: "standard" };
}

export function selectEvaluatedUsdcToBrlaAmount(
  standard: EvaluatedUsdcToBrlaAmount,
  profitable: EvaluatedUsdcToBrlaAmount,
  manualAmount: string | null
): UsdcToBrlaAmountSelection {
  if (manualAmount) return { amountUsdc: manualAmount, reason: "manual" };

  if (profitable.projectedProfitable) return { amountUsdc: profitable.amountUsdc, reason: "profitable" };

  return { amountUsdc: standard.amountUsdc, reason: "standard" };
}
