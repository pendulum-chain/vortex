import { getNetworkId, isNetworkEVM, Networks } from "@packages/shared";
import { createContext, ReactNode, useCallback, useContext, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { WALLETCONNECT_ASSETHUB_ID } from "../constants/constants";
import { LocalStorageKeys, useLocalStorage } from "../hooks/useLocalStorage";
import { useRampUrlParams } from "../hooks/useRampUrlParams";
import { useRampActions } from "../stores/rampStore";
import { useSep24Actions } from "../stores/sep24Store";

interface NetworkContextType {
  walletConnectPolkadotSelectedNetworkId: string;
  selectedNetwork: Networks;
  setSelectedNetwork: (network: Networks, resetState?: boolean) => Promise<void>;
  networkSelectorDisabled: boolean;
  setNetworkSelectorDisabled: (disabled: boolean) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  networkSelectorDisabled: false,
  selectedNetwork: Networks.AssetHub,
  setNetworkSelectorDisabled: () => null,
  setSelectedNetwork: async () => undefined,
  walletConnectPolkadotSelectedNetworkId: WALLETCONNECT_ASSETHUB_ID
});

interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider = ({ children }: NetworkProviderProps) => {
  const { state: selectedNetworkLocalStorageState, set: setSelectedNetworkLocalStorage } = useLocalStorage<Networks>({
    defaultValue: Networks.Polygon,
    key: LocalStorageKeys.SELECTED_NETWORK
  });

  const { network } = useRampUrlParams();

  // We do this to ensure that the local storage value is always in lowercase. Previously the first letter was uppercase
  const selectedNetworkLocalStorage = selectedNetworkLocalStorageState.toLowerCase() as Networks;

  const [selectedNetwork, setSelectedNetworkState] = useState<Networks>(network || selectedNetworkLocalStorage);
  const [networkSelectorDisabled, setNetworkSelectorDisabled] = useState(false);

  const { resetRampState } = useRampActions();
  const { cleanup: cleanupSep24Variables } = useSep24Actions();
  const { switchChainAsync } = useSwitchChain();
  const { chain: connectedEvmChain } = useAccount();

  const setSelectedNetwork = useCallback(
    async (network: Networks, resetState = false) => {
      if (resetState) {
        resetRampState();
        cleanupSep24Variables();
      }
      setSelectedNetworkState(network);
      setSelectedNetworkLocalStorage(network);

      // Will only switch chain on the EVM connected wallet case.
      if (isNetworkEVM(network)) {
        // Only switch chain if the network is different from the current one
        // see https://github.com/wevm/wagmi/issues/3417
        if (!connectedEvmChain || connectedEvmChain.id !== getNetworkId(network)) {
          await switchChainAsync({ chainId: getNetworkId(network) });
        }
      }
    },
    [connectedEvmChain, switchChainAsync, setSelectedNetworkLocalStorage, resetRampState, cleanupSep24Variables]
  );

  return (
    <NetworkContext
      value={{
        networkSelectorDisabled,
        selectedNetwork,
        setNetworkSelectorDisabled,
        setSelectedNetwork,
        walletConnectPolkadotSelectedNetworkId: WALLETCONNECT_ASSETHUB_ID
      }}
    >
      {children}
    </NetworkContext>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
};
