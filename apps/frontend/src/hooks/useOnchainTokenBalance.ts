import { OnChainTokenDetails, OnChainTokenDetailsWithBalance } from "@packages/shared";
import { useMemo } from "react";
import { useOnchainTokenBalances } from "./useOnchainTokenBalances";

export const useOnchainTokenBalance = ({ token }: { token: OnChainTokenDetails }): OnChainTokenDetailsWithBalance => {
  const tokens = useMemo(() => [token], [token]);
  const balances = useOnchainTokenBalances(tokens);

  // Filter out native tokens since this hook specifically expects OnChainTokenDetails
  const onChainBalance = balances.find(
    (balance): balance is OnChainTokenDetailsWithBalance => "type" in balance && balance.type !== undefined
  );

  if (!onChainBalance) {
    // Return a default balance if no matching token found
    return { ...token, balance: "0" };
  }

  return onChainBalance;
};

export function getOnchainTokenBalance(token?: OnChainTokenDetailsWithBalance): string {
  return token?.balance ?? "0";
}
