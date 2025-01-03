import { createContext } from 'preact';
import { useContext, useState, useEffect, useCallback } from 'preact/hooks';
import { useSwitchChain } from 'wagmi';
import { useLocalStorage, LocalStorageKeys } from '../hooks/useLocalStorage';
import { WALLETCONNECT_ASSETHUB_ID } from '../constants/constants';
import { useOfframpActions } from '../stores/offrampStore';
import { getNetworkId, isNetworkEVM, Networks } from '../helpers/networks';

interface NetworkContextType {
  walletConnectPolkadotSelectedNetworkId: string;
  selectedNetwork: Networks;
  setSelectedNetwork: (network: Networks) => void;
  networkSelectorDisabled: boolean;
  setNetworkSelectorDisabled: (disabled: boolean) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  walletConnectPolkadotSelectedNetworkId: WALLETCONNECT_ASSETHUB_ID,
  selectedNetwork: Networks.AssetHub,
  setSelectedNetwork: () => null,
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
  const [networkSelectorDisabled, setNetworkSelectorDisabled] = useState(false);

  const { resetOfframpState } = useOfframpActions();
  const { switchChain } = useSwitchChain();

  const setSelectedNetwork = useCallback(
    (network: Networks) => {
      resetOfframpState();
      setSelectedNetworkState(network);
      setSelectedNetworkLocalStorage(network);

      // Will only switch chain on the EVM conneted wallet case.
      if (isNetworkEVM(network)) {
        switchChain({ chainId: getNetworkId(network) });
      }
    },
    [switchChain, setSelectedNetworkLocalStorage, resetOfframpState],
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
