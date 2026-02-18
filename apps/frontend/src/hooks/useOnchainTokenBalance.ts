import { OnChainTokenDetails, OnChainTokenDetailsWithBalance } from "@vortexfi/shared";
import { useTokenBalance } from "../stores/tokenBalanceStore";

export const useOnchainTokenBalance = ({ token }: { token: OnChainTokenDetails }): OnChainTokenDetailsWithBalance => {
  const balance = useTokenBalance(token.network, token.assetSymbol);

  return {
    ...token,
    balance: balance?.balance ?? "0.00",
    balanceUsd: balance?.balanceUsd ?? "0.00"
  };
};
