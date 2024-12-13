import { createContext } from 'preact';
import { useContext, useState, useEffect, useCallback } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';

import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';
import { WALLETCONNECT_ASSETHUB_ID } from '../constants/constants';

export enum Networks {
  AssetHub = 'AssetHub',
  Polygon = 'Polygon',
  Ethereum = 'Ethereum',
  BSC = 'BSC',
  Arbitrum = 'Arbitrum',
  Base = 'Base',
  Avalanche = 'Avalanche',
}

export function isNetworkEVM(network: Networks): boolean {
  switch (network) {
    case Networks.Polygon:
    case Networks.Ethereum:
    case Networks.BSC:
    case Networks.Arbitrum:
    case Networks.Base:
    case Networks.Avalanche:
      return true;
    default:
      return false;
  }
}

export function getNetworkId(network: Networks): number | undefined {
  switch (network) {
    case Networks.Polygon:
      return 137;
    case Networks.Ethereum:
      return 1;
    case Networks.BSC:
      return 56;
    case Networks.Arbitrum:
      return 42161;
    case Networks.Base:
      return 8453;
    case Networks.Avalanche:
      return 43114;
    default:
      return undefined;
  }
}

interface NetworkContextType {
  walletConnectPolkadotSelectedNetworkId: string;
  selectedNetwork: Networks;
  setSelectedNetwork: (network: Networks) => void;
  setOnSelectedNetworkChange: (callback: (network: Networks) => void) => void;
  networkSelectorDisabled: boolean;
  setNetworkSelectorDisabled: (disabled: boolean) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  walletConnectPolkadotSelectedNetworkId: WALLETCONNECT_ASSETHUB_ID,
  selectedNetwork: Networks.AssetHub,
  setSelectedNetwork: () => null,
  setOnSelectedNetworkChange: () => null,
  networkSelectorDisabled: false,
  setNetworkSelectorDisabled: () => null,
});

interface NetworkProviderProps {
  children: preact.ComponentChildren;
}

export const NetworkProvider = ({ children }: NetworkProviderProps) => {
  const { state: selectedNetworkLocalStorage, set: setSelectedNetworkLocalStorage } = useLocalStorage<Networks>({
    key: LocalStorageKeys.SELECTED_NETWORK,
    defaultValue: Networks.AssetHub,
  });

  const [selectedNetwork, setSelectedNetworkState] = useState<Networks>(selectedNetworkLocalStorage);
  const [onNetworkChange, setOnSelectedNetworkChange] = useState<((network: Networks) => void) | undefined>();
  const [networkSelectorDisabled, setNetworkSelectorDisabled] = useState(false);
  const { chains, switchChain } = useSwitchChain();

  const setSelectedNetwork = useCallback(
    (network: Networks) => {
      if (onNetworkChange) {
        onNetworkChange(network);
      }
      setSelectedNetworkState(network);
      setSelectedNetworkLocalStorage(network);

      // Will only switch chain on the EVM conneted wallet, if chain id has been defined in wagmi config.
      const chain = chains.find((c) => c.id === getNetworkId(network));
      if (chain) {
        switchChain({ chainId: chain.id });
      }
    },
    [switchChain, chains, setSelectedNetworkLocalStorage, onNetworkChange],
  );

  // Only run on first render
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const networkParam = params.get('network')?.toLowerCase();

    if (networkParam) {
      const matchedNetwork = Object.values(Networks).find((network) => network.toLowerCase() === networkParam);

      if (matchedNetwork) {
        setSelectedNetwork(matchedNetwork);
      }
    }
  }, [setSelectedNetwork]);

  return (
    <NetworkContext.Provider
      value={{
        walletConnectPolkadotSelectedNetworkId: WALLETCONNECT_ASSETHUB_ID,
        selectedNetwork,
        setSelectedNetwork,
        networkSelectorDisabled,
        setNetworkSelectorDisabled,
        setOnSelectedNetworkChange,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
