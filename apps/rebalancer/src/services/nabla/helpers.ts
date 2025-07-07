import type { Limits } from "@pendulum-chain/api-solang";
import type { ApiPromise } from "@polkadot/api";
import type { ContractOptions } from "@polkadot/api-contract/types";
import type { INumber } from "@polkadot/types-codec/types";
import Big from "big.js";
import BigNumber from "big.js";

export const NABLA_ROUTER = "6gAVVw13mQgzzKk4yEwScMmWiCNyMAunXFJUZonbgKrym81N";

export interface ContractBalance {
  rawBalance: Big;
  decimals: number;
  preciseBigDecimal: Big;
  preciseString: string;
  approximateStrings: {
    atLeast2Decimals: string;
    atLeast4Decimals: string;
  };
  approximateNumber: number;
}

export const defaultReadLimits: Limits = {
  gas: {
    proofSize: "10000000000000000",
    refTime: "10000000000000000"
  },
  storageDeposit: undefined
};

export const defaultWriteLimits: Limits = {
  gas: {
    proofSize: "10000000000",
    refTime: "10000000000000"
  },
  storageDeposit: undefined
};

export const createWriteOptions = (_api: ApiPromise, opts?: ContractOptions) => ({
  gas: {
    proofSize: "1300000",
    refTime: "345000000000"
  },
  storageDepositLimit: null,
  ...opts
});

export function multiplyByPowerOfTen(bigDecimal: Big.BigSource, power: number) {
  const newBigDecimal = new BigNumber(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e += power;
  return newBigDecimal;
}

export function stringifyBigWithSignificantDecimals(big: BigNumber, decimals: number) {
  const rounded = roundDownToSignificantDecimals(big, decimals);

  let significantDecimals;
  if (rounded.eq(0)) {
    significantDecimals = decimals;
  } else {
    significantDecimals = Math.max(decimals, Math.min(decimals, rounded.c.length) - 1 - rounded.e);
  }

  return rounded.toFixed(significantDecimals, 0);
}

export function roundDownToSignificantDecimals(number: Big.BigSource, decimals: number) {
  const big = new Big(number);
  return big.prec(Math.max(0, big.e + 1) + decimals, 0);
}

export function parseContractBalanceResponse(
  decimals: number | undefined,
  balanceResponse: INumber | bigint | undefined
): ContractBalance | undefined {
  if (balanceResponse === undefined || decimals === undefined) return undefined;

  const rawBalanceBigInt = typeof balanceResponse === "bigint" ? balanceResponse : balanceResponse.toBigInt();

  const rawBalanceString = rawBalanceBigInt.toString();
  const preciseBigDecimal = multiplyByPowerOfTen(new BigNumber(rawBalanceString), -decimals);

  const atLeast2Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 2);
  const atLeast4Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 4);
  const rawBalanceBigNumber = new BigNumber(rawBalanceBigInt.toString());

  return {
    approximateNumber: preciseBigDecimal.toNumber(),
    approximateStrings: {
      atLeast2Decimals,
      atLeast4Decimals
    },
    decimals,
    preciseBigDecimal,
    preciseString: preciseBigDecimal.toFixed(),
    rawBalance: rawBalanceBigNumber
  };
}
