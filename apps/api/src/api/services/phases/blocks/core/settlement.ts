import Big from "big.js";

export function settlementBalanceKey(network: string, owner: string, token: string): string {
  return `${network}:${owner.toLowerCase()}:${token.toLowerCase()}`;
}

export function calculateSettlementSubsidyRaw(
  expectedAmountRaw: Big,
  actualBalanceRaw: Big,
  baselineRaw: Big,
  gasReserveRaw: Big
): Big {
  const delivered = actualBalanceRaw.minus(baselineRaw);
  const deliveredRaw = delivered.gt(0) ? delivered : new Big(0);
  const deliveryGap = expectedAmountRaw.minus(deliveredRaw).plus(gasReserveRaw);
  const deliveryGapRaw = deliveryGap.gt(0) ? deliveryGap : new Big(0);
  const onChainShortfall = expectedAmountRaw.plus(gasReserveRaw).minus(actualBalanceRaw);
  const onChainShortfallRaw = onChainShortfall.gt(0) ? onChainShortfall : new Big(0);
  return deliveryGapRaw.lt(onChainShortfallRaw) ? deliveryGapRaw : onChainShortfallRaw;
}
