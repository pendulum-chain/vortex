import { useEffect, useState } from 'react';
import { nativeToDecimal , customToDecimal} from '../../helpers/parseNumbers';
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

          // use assetCodeHex if exist, otherwise use asset_code
          const assetCode = config.assetCodeHex || config.assetCode;

          const response = (
            await apiComponents.api.query.tokens.accounts(address, config.currencyId)
          ).toHuman() as any;

          const rawBalance = response?.free?.toString() || '0';
          const formattedBalance = nativeToDecimal(rawBalance).toString();

          const contractBalance = {
            rawBalance: BigInt(rawBalance),
            decimals: config.decimals,
            preciseBigDecimal: new BigNumber(rawBalance),
            preciseString: formattedBalance,
            approximateStrings: {
              atLeast2Decimals: formattedBalance,
              atLeast4Decimals: formattedBalance,
            },
            approximateNumber: Number(formattedBalance),
          };

          // if it is offramped, it should always ahve minWithrawalAmount defined
          if (config.isOfframp && config.minWithdrawalAmount){
            const minWithdrawalAmount = customToDecimal(config.minWithdrawalAmount, config.decimals).toString();
            const canWithdraw = Number(formattedBalance) >= Number(minWithdrawalAmount);

            newBalances[key] = {
              ...contractBalance,
              canWithdraw
            };
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
