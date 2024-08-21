import { useEffect, useState } from 'react';
import { stringDecimalToBN, toBigNumber } from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { ContractBalance } from '../../helpers/contracts';
export interface BalanceInfo extends ContractBalance {
  canWithdraw: boolean;
}

export interface UseAccountBalanceResponse {
  balances: { [key: string]: BalanceInfo };
  isBalanceLoading: boolean;
  balanceError?: Error;
}

export const useAccountBalance = (address?: string): UseAccountBalanceResponse => {
  const [balances, setBalances] = useState<{ [key: string]: BalanceInfo }>({});
  const [isBalanceLoading, setIsLoading] = useState(false);
  const [balanceError, setError] = useState<Error>();

  useEffect(() => {
    const fetchBalances = async () => {
      if (!address) {
        setBalances({});
        return;
      }

      const apiManager = await getApiManagerInstance();
      const apiComponents = await apiManager.getApiComponents();
      if (!apiComponents) {
        setBalances({});
        return;
      }

      setIsLoading(true);
      const newBalances: { [key: string]: BalanceInfo } = {};

      try {
        for (const [key, config] of Object.entries(TOKEN_CONFIG)) {
          const response = (await apiComponents.api.query.tokens.accounts(address, config.currencyId)).toHuman() as any;

          const rawBalance = response?.free || '0';
          const preciseBigDecimal = toBigNumber(rawBalance, TOKEN_CONFIG[key].decimals);
          const balanceBigNumber = toBigNumber(rawBalance, 0);

          const atLeast2Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 2);
          const atLeast4Decimals = stringifyBigWithSignificantDecimals(preciseBigDecimal, 4);

          const contractBalance = {
            rawBalance: balanceBigNumber,
            decimals: config.decimals,
            preciseBigDecimal,
            preciseString: balanceBigNumber.toString(),
            approximateStrings: {
              atLeast2Decimals: atLeast2Decimals,
              atLeast4Decimals: atLeast4Decimals,
            },
            approximateNumber: preciseBigDecimal.toNumber(),
          };

          // if it is offramped, it should always ahve minWithrawalAmount defined
          if (config.isOfframp && config.minWithdrawalAmount) {
            const minWithdrawalAmount = toBigNumber(config.minWithdrawalAmount, 0);
            const canWithdraw = balanceBigNumber.gte(minWithdrawalAmount);

            newBalances[key] = {
              ...contractBalance,
              canWithdraw,
            };
            continue;
          }

          newBalances[key] = {
            ...contractBalance,
            canWithdraw: false,
          };
        }
        setBalances(newBalances);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalances();
  }, [address]);

  return {
    balances,
    isBalanceLoading,
    balanceError,
  };
};
