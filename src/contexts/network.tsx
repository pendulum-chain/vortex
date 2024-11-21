import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';
import { NetworkIconType, Networks } from '../hooks/useGetNetworkIcon';
import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';

const assetHubId = 'polkadot:68d56f15f85d3136970ec16946040bc1';

interface NetworkContextType {
  polkadotSelectedNetworkId: string;
  selectedNetwork: NetworkIconType;
  setSelectedNetwork: (network: NetworkIconType) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  polkadotSelectedNetworkId: assetHubId,
  selectedNetwork: Networks.assetHub,
  setSelectedNetwork: () => null,
});

export const NetworkProvider = ({ children }: { children: preact.ComponentChildren }) => {
  const { state: selectedNetworkLocalStorage, set: setSelectedNetworkLocalStorage } = useLocalStorage<NetworkIconType>({
    key: LocalStorageKeys.SELECTED_NETWORK,
    defaultValue: Networks.assetHub,
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
        polkadotSelectedNetworkId: assetHubId,
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
