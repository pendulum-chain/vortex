import { createContext } from 'preact';
import { useContext, useState, useEffect, useCallback } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';

import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';
import { NetworkIconType } from '../hooks/useGetNetworkIcon';
import { ASSETHUB_ID } from '../constants/constants';

export enum Networks {
  AssetHub = 'AssetHub',
  Polygon = 'Polygon',
}

interface NetworkContextType {
  polkadotSelectedNetworkId: string;
  selectedNetwork: NetworkIconType;
  setSelectedNetwork: (network: NetworkIconType) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  polkadotSelectedNetworkId: ASSETHUB_ID,
  selectedNetwork: Networks.AssetHub,
  setSelectedNetwork: () => null,
});

export const NetworkProvider = ({ children }: { children: preact.ComponentChildren }) => {
  const { state: selectedNetworkLocalStorage, set: setSelectedNetworkLocalStorage } = useLocalStorage<NetworkIconType>({
    key: LocalStorageKeys.SELECTED_NETWORK,
    defaultValue: Networks.AssetHub,
  });

  const [selectedNetwork, setSelectedNetworkState] = useState<NetworkIconType>(selectedNetworkLocalStorage);
  const { chains, switchChain } = useSwitchChain();

  const setSelectedNetwork = useCallback(
    (networkId: NetworkIconType) => {
      setSelectedNetworkState(networkId);
      setSelectedNetworkLocalStorage(networkId);
      const chain = chains.find((c) => c.id === Number(networkId));
      if (chain) {
        switchChain({ chainId: chain.id });
      }
    },
    [switchChain, chains, setSelectedNetworkLocalStorage],
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
        polkadotSelectedNetworkId: ASSETHUB_ID,
        selectedNetwork,
        setSelectedNetwork,
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
