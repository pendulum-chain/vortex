export interface UsdcToBrlaAmountSelection {
  amountUsdc: string;
  reason: "manual" | "standard" | "profitable";
}

export function selectUsdcToBrlaAmount(
  standardAmount: string,
  profitableAmount: string,
  isProjectedProfitable: boolean,
  manualAmount: string | null
): UsdcToBrlaAmountSelection {
  if (manualAmount) return { amountUsdc: manualAmount, reason: "manual" };

  if (isProjectedProfitable) return { amountUsdc: profitableAmount, reason: "profitable" };

  return { amountUsdc: standardAmount, reason: "standard" };
}
