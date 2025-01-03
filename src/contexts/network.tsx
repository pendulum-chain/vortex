import { createContext } from 'preact';
import { useContext, useState, useEffect, useCallback } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';

import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';
import { WALLETCONNECT_ASSETHUB_ID } from '../constants/constants';

export enum Networks {
  AssetHub = 'AssetHub',
  Polygon = 'Polygon',
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
    (networkId: Networks) => {
      if (onNetworkChange) {
        //onNetworkChange(networkId);
      }
      setSelectedNetworkState(networkId);
      setSelectedNetworkLocalStorage(networkId);
      const chain = chains.find((c) => c.id === Number(networkId));
      if (chain) {
        switchChain({ chainId: chain.id });
      }
    },
    [switchChain, chains, setSelectedNetworkLocalStorage, onNetworkChange],
  );

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
