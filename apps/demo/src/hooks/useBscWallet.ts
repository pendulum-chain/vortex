import { bsc } from "@reown/appkit/networks";
import { useAccount, useSwitchChain } from "wagmi";

export function useBscWallet() {
  const { address, chainId, isConnected } = useAccount();
  const { isPending: isSwitchingNetwork, switchChainAsync } = useSwitchChain();
  const isOnBsc = isConnected && chainId === bsc.id;

  return {
    destinationAddress: isOnBsc ? address : undefined,
    isConnected,
    isOnBsc,
    isSwitchingNetwork,
    switchToBsc: () => switchChainAsync({ chainId: bsc.id })
  };
}
