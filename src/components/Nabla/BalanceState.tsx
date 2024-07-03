import { useEffect, useState } from 'react';
import { toBigNumber } from '../../helpers/parseNumbers';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { parseContractBalanceResponse } from '../../helpers/contracts';
import { ContractBalance } from '../../helpers/contracts';
import { useReadContract } from 'wagmi'
import BigNumber from 'big.js';
import erc20ABI from '../../contracts/ERC20';

export interface BalanceInfo extends ContractBalance {
  canWithdraw: boolean;
}

export interface UseAccountBalanceResponse {
  balance:  BalanceInfo;
  isBalanceLoading: boolean;
  balanceError?: Error;
}
 ;
 let zeroBalance =  {
                  ...parseContractBalanceResponse(6, BigInt(0)),
                  canWithdraw: false,
                }

export const useAccountBalance = (address?: string): UseAccountBalanceResponse => {
  const [balanceParsed, setBalance] = useState<BalanceInfo>(zeroBalance);
  const [isBalanceLoading, setIsLoading] = useState(false);
  const [balanceError, setError] = useState<Error>();

  const { data: balance } = useReadContract({
    abi: erc20ABI,
    address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    functionName: 'balanceOf',
    args: [address],
  })
  

  useEffect(() => {
    const fetchBalances = async () => {
      console.log(address)
      if (!address) {
        setBalance( {
          ...zeroBalance,
          canWithdraw: false,
        });
        return;
      }     
      try {

        const rawBalance = balance as bigint;
        const contractBalance = parseContractBalanceResponse(6, rawBalance);
        console.log(contractBalance)

        // if it is offramped, it should always have minWithrawalAmount defined

        const minWithdrawalAmount = toBigNumber(100, 0);
        const canWithdraw = contractBalance.rawBalance.gte(minWithdrawalAmount);

        const balancePolygonAsset = {
            ...contractBalance,
            canWithdraw,
          };

    
        setBalance(balancePolygonAsset);
      } catch (err) {
        console.log(err)
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalances();
  }, [address]);

  return {
    balance: balanceParsed,
    isBalanceLoading,
    balanceError,
  };
};
