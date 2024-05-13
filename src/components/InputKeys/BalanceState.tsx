import { useEffect, useState } from 'react';
import { nativeToDecimal } from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { Keypair } from 'stellar-sdk';

export interface BalanceInfo {
  balance: string;
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
          const ASSET_ISSUER_RAW = `0x${Keypair.fromPublicKey(config.assetIssuer).rawPublicKey().toString('hex')}`;

          // use assetCodeHex if exist, otherwise use asset_code
          const assetCode = config.assetCodeHex || config.assetCode;

          const response = (
            await apiComponents.api.query.tokens.accounts(address, {
              Stellar: { AlphaNum4: { code: assetCode, issuer: ASSET_ISSUER_RAW } },
            })
          ).toHuman();

          const rawBalance = response?.free?.toString() || '0';
          const formattedBalance = nativeToDecimal(rawBalance).toString();
          const minWithdrawalAmount = nativeToDecimal(config.minWithdrawalAmount).toString();
          const canWithdraw = Number(formattedBalance) >= Number(minWithdrawalAmount);

          newBalances[key] = {
            balance: formattedBalance,
            canWithdraw
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
