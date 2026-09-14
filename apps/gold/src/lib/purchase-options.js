export const MIN_BUY = 50;
export const QUICK_BUY_VALUES = [50, 250, 500];
export const DEFAULT_BUY = MIN_BUY;

export function validBuyAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= MIN_BUY;
}

export function buyFeePercent(quote, amount) {
  const fees = quote.totalFee ?? (Number(quote.networkFee) + Number(quote.serviceFee));
  return Number(amount) > 0 && Number.isFinite(fees) ? fees / Number(amount) * 100 : null;
}
