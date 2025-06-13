import Big from 'big.js';

export const ChainDecimals = 12;

export const nativeToDecimal = (value: Big, decimals: number = ChainDecimals): Big => {
  const divisor = new Big(10).pow(decimals);
  return value.div(divisor);
};

export function multiplyByPowerOfTen(bigDecimal: Big.BigSource, power: number): Big {
  const newBigDecimal = new Big(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e += power;
  return newBigDecimal;
}

export function divideByPowerOfTen(bigDecimal: Big, power: number): Big {
  const newBigDecimal = new Big(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e -= power;
  return newBigDecimal;
}
