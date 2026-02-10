import { useEffect } from "react";
import { useAssetHubNode } from "../contexts/polkadotNode";
import { useTokenBalanceActions } from "../stores/tokenBalanceStore";
import { useVortexAccount } from "./useVortexAccount";

/**
 * Hook to initialize token balances when wallet connects.
 * Should be called once at the app level (e.g., in App.tsx or a layout component).
 */
export function useInitTokenBalances(): void {
  const { evmAddress, substrateAddress } = useVortexAccount();
  const { apiComponents: assethubNode } = useAssetHubNode();
  const { fetchBalances, clearBalances } = useTokenBalanceActions();

  useEffect(() => {
    if (!evmAddress && !substrateAddress) {
      clearBalances();
      return;
    }

    fetchBalances(evmAddress ?? null, substrateAddress ?? null, assethubNode?.api);
  }, [evmAddress, substrateAddress, assethubNode?.api, fetchBalances, clearBalances]);
}
