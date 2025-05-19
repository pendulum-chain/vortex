import { INumber } from '@polkadot/types-codec/types';
import BigNumber from 'big.js';
import { Limits } from '@pendulum-chain/api-solang';
import type { ApiPromise } from '@polkadot/api';
import { ContractOptions } from '@polkadot/api-contract/types';
import { roundDownToSignificantDecimals } from 'shared';

const BIG_0 = new BigNumber('0');

export const defaultReadLimits: Limits = {
  gas: {
    refTime: '10000000000000000',
    proofSize: '10000000000000000',
  },
  storageDeposit: undefined,
};

export const defaultWriteLimits: Limits = {
  gas: {
    refTime: '10000000000000',
    proofSize: '10000000000',
  },
  storageDeposit: undefined,
};

export const createWriteOptions = (api: ApiPromise, opts?: ContractOptions) => ({
  gas: {
    refTime: '345000000000',
    proofSize: '1300000',
  },
  storageDepositLimit: null,
  ...opts,
});

export interface ContractBalance {
  rawBalance: BigNumber;
  decimals: number;
  preciseBigDecimal: BigNumber;
  preciseString: string;
  approximateStrings: {
    atLeast2Decimals: string;
    atLeast4Decimals: string;
  };
  approximateNumber: number;
}


export function multiplyByPowerOfTen(bigDecimal: BigNumber, power: number) {
  const newBigDecimal = new BigNumber(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e += power;
  return newBigDecimal;
}

export function stringifyBigWithSignificantDecimals(big: BigNumber, decimals: number) {
  const rounded = roundDownToSignificantDecimals(big, decimals);

  let significantDecimals;
  if (rounded.eq(BIG_0)) {
    significantDecimals = decimals;
  } else {
    significantDecimals = Math.max(decimals, Math.min(decimals, rounded.c.length) - 1 - rounded.e);
  }

  return rounded.toFixed(significantDecimals, 0);
}

export function parseContractBalanceResponse(decimals: number, balanceResponse: INumber | bigint): ContractBalance;

export function parseContractBalanceResponse(
  decimals: number | undefined,
  balanceResponse: INumber | bigint | undefined,
): ContractBalance | undefined;

export function parseContractBalanceResponse(
  decimals: number | undefined,
  balanceResponse: INumber | bigint | undefined,
): ContractBalance | undefined {
  if (balanceResponse === undefined || decimals === undefined) return undefined;

  const rawBalanceBigInt = typeof balanceResponse === 'bigint' ? balanceResponse : balanceResponse.toBigInt();

  const rawBalanceString = rawBalanceBigInt.toString();
  const preciseBigDecimal = multiplyByPowerOfTen(new BigNumber(rawBalanceString), -decimals);

  const atLeast2Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 2);
  const atLeast4Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 4);
  const rawBalanceBigNumber = new BigNumber(rawBalanceBigInt.toString());

  return {
    rawBalance: rawBalanceBigNumber,
    decimals,
    preciseBigDecimal,
    preciseString: preciseBigDecimal.toFixed(),
    approximateStrings: {
      atLeast2Decimals,
      atLeast4Decimals,
    },
    approximateNumber: preciseBigDecimal.toNumber(),
  };
}

