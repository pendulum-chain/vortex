import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';
import { NetworkIconType, NetworkIcons } from '../hooks/useGetNetworkIcon';
import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';

interface NetworkContextType {
  selectedNetwork: NetworkIconType;
  setSelectedNetwork: (network: NetworkIconType) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  selectedNetwork: NetworkIcons.assetHub,
  setSelectedNetwork: () => null,
});

export const NetworkProvider = ({ children }: { children: preact.ComponentChildren }) => {
  const { state: selectedNetworkLocalStorage, set: setSelectedNetworkLocalStorage } = useLocalStorage<NetworkIconType>({
    key: LocalStorageKeys.SELECTED_NETWORK,
    defaultValue: NetworkIcons.assetHub,
  });

  const [selectedNetwork, setSelectedNetworkState] = useState<NetworkIconType>(selectedNetworkLocalStorage);
  const { chains, switchChain } = useSwitchChain();

  const setSelectedNetwork = (networkId: NetworkIconType) => {
    setSelectedNetworkState(networkId);
    setSelectedNetworkLocalStorage(networkId);
    const chain = chains.find((c) => c.id === Number(networkId));
    if (chain) {
      switchChain({ chainId: chain.id });
    }
  };

  return (
    <NetworkContext.Provider
      value={{
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
