import { useEffect, useState } from 'react';
import { stringDecimalToBN , customToDecimal} from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { Keypair } from 'stellar-sdk';
import { ContractBalance } from '../../helpers/contracts';
import BigNumber from 'bn.js';
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
          const response = (
            await apiComponents.api.query.tokens.accounts(address, config.currencyId)
          ).toHuman() as any;
          
          const rawBalance = response?.free || '0';
          const balanceDecimal = customToDecimal(rawBalance, TOKEN_CONFIG[key].decimals);

          const contractBalance = {
            decimals: config.decimals,
            preciseBigDecimal: new BigNumber(0),
            preciseString: balanceDecimal.toString(),
            approximateStrings: {
              atLeast2Decimals: balanceDecimal.toString(),
              atLeast4Decimals: balanceDecimal.toString(),
            },
            approximateNumber: balanceDecimal,
          };

          // if it is offramped, it should always ahve minWithrawalAmount defined
          if (config.isOfframp && config.minWithdrawalAmount){
            const minWithdrawalAmount = customToDecimal(config.minWithdrawalAmount, config.decimals).toString();
            const canWithdraw = balanceDecimal >= Number(minWithdrawalAmount);

            newBalances[key] = {
              ...contractBalance,
              canWithdraw
            };
            continue;
          }

          newBalances[key] = {
            ...contractBalance,
            canWithdraw: false
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
