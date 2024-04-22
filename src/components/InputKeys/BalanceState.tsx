import { useEffect, useState } from 'react';
import { ApiPromise } from '@polkadot/api';
import { nativeToDecimal } from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { ASSET_CODE } from '../../constants/constants';
import {ASSET_ISSUER_RAW} from '../../services/polkadot/index'

export interface UseAccountBalanceResponse {
  balance?: string;
  isBalanceLoading: boolean;
  balanceError?: Error;
}


export const useAccountBalance = (address?: string): UseAccountBalanceResponse => {
  const [balance, setBalance] = useState<string>();
  const [isBalanceLoading, setIsLoading] = useState(false);
  const [balanceError, setError] = useState<Error>();

  useEffect(() => {
    const fetchBalance = async () => {
      const apiManager =  await getApiManagerInstance()
      const api = await apiManager.getApi();
      if (!api || !address) {
        setBalance(undefined);
        return;
      }

      try {
        setIsLoading(true);
        console.log(address)
        const response = (await api.api.query.tokens.accounts(address, { Stellar: { AlphaNum4: { code: ASSET_CODE, issuer: ASSET_ISSUER_RAW }} }
        )).toHuman();
        console.log(response)
        const balance = response?.free?.toString() || '0';
        const formattedBalance = nativeToDecimal(balance).toString();

        setBalance(formattedBalance);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    };

    fetchBalance();
  }, [address]);

  return {
    balance,
    isBalanceLoading,
    balanceError,
  };
};
