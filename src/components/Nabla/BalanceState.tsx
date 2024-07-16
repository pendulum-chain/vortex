import { useEffect, useState } from 'react';
import { toBigNumber } from '../../helpers/parseNumbers';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { parseContractBalanceResponse } from '../../helpers/contracts';
import { ContractBalance } from '../../helpers/contracts';
import { useReadContract } from 'wagmi';
import erc20ABI from '../../contracts/ERC20';

export interface BalanceInfo extends ContractBalance {
  canWithdraw: boolean;
}

export interface UseAccountBalanceResponse {
  balance: BalanceInfo;
  isBalanceLoading: boolean;
  balanceError?: Error;
}
const zeroBalance = {
  ...parseContractBalanceResponse(6, BigInt(0)),
  canWithdraw: false,
};

export const useAccountBalance = (address?: string): UseAccountBalanceResponse => {
  const [balanceParsed, setBalance] = useState<BalanceInfo>(zeroBalance);
  const [isBalanceLoading, setIsLoading] = useState(true);
  const [balanceError, setError] = useState<Error>();

  const { data: balance } = useReadContract({
    abi: erc20ABI,
    address: TOKEN_CONFIG.usdc.erc20AddressNativeChain as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
  });

  useEffect(() => {
    const fetchBalances = async () => {
      if (!address) {
        setBalance({
          ...zeroBalance,
          canWithdraw: false,
        });
        return;
      }
      try {
        const rawBalance = balance as bigint;
        const contractBalance = parseContractBalanceResponse(6, rawBalance);

        // We don't need this, now. Unless we wan't to support also offramp from native polygon chain.
        // otherwise, the minimum is irrelevant.
        const minWithdrawalAmount = toBigNumber(100, 0);
        const canWithdraw = contractBalance.rawBalance.gte(minWithdrawalAmount);

        const balancePolygonAsset = {
          ...contractBalance,
          canWithdraw,
        };

        setBalance(balancePolygonAsset);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalances();
  }, [address, balance]);

  return {
    balance: balanceParsed,
    isBalanceLoading,
    balanceError,
  };
};
