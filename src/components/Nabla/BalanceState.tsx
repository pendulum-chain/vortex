import { useEffect, useState } from 'react';
import { toBigNumber } from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { parseContractBalanceResponse } from '../../helpers/contracts';
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
          const response = (await apiComponents.api.query.tokens.accounts(address, config.currencyId)) as any;

          const rawBalance = response?.free || '0';
          const contractBalance = parseContractBalanceResponse(TOKEN_CONFIG[key].decimals, rawBalance);

          // if it is offramped, it should always have minWithrawalAmount defined
          if (config.isOfframp && config.minWithdrawalAmount) {
            const minWithdrawalAmount = toBigNumber(config.minWithdrawalAmount, 0);
            const canWithdraw = contractBalance.rawBalance.gte(minWithdrawalAmount);

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
