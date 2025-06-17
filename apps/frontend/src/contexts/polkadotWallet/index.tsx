import { WalletAccount } from "@talismn/connect-wallets";
import { JSX, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LocalStorageKeys, useLocalStorage } from "../../hooks/useLocalStorage";
import { storageService } from "../../services/storage/local";
import { handleWalletConnectDisconnect, initSelectedWallet } from "./helpers";

export interface PolkadotWalletState {
  tenantRPC?: string;
  walletAccount?: WalletAccount;
  setWalletAccount: (data: WalletAccount) => void;
  removeWalletAccount: () => void;
}

const PolkadotWalletStateContext = createContext<PolkadotWalletState | undefined>(undefined);

const PolkadotWalletStateProvider = ({ children }: { children: JSX.Element }) => {
  const [walletAccount, setWallet] = useState<WalletAccount | undefined>(undefined);

  const {
    state: storageAddress,
    set,
    clear
  } = useLocalStorage<string | undefined>({
    key: `${LocalStorageKeys.SELECTED_POLKADOT_ACCOUNT}`
  });

  const removeWalletAccount = useCallback(async () => {
    const clearLocalStorageWallets = () => {
      storageService.remove(LocalStorageKeys.SELECTED_POLKADOT_WALLET);
    };

    await handleWalletConnectDisconnect(walletAccount);
    clear();
    clearLocalStorageWallets();
    setWallet(undefined);
  }, [clear, walletAccount]);

  const setWalletAccount = useCallback(
    (newWalletAccount: WalletAccount | undefined) => {
      set(newWalletAccount?.address);
      setWallet(newWalletAccount);
    },
    [set]
  );

  useEffect(() => {
    const delayWalletInitialization = async (address: string) => {
      setTimeout(async () => {
        const selectedWallet = await initSelectedWallet(address);
        if (selectedWallet) setWallet(selectedWallet);
      }, 400);
    };

    const initializeWallet = () => {
      if (!storageAddress) {
        return;
      }
      delayWalletInitialization(storageAddress).catch(console.error);
    };
    initializeWallet();
  }, [storageAddress]);

  const providerValue = useMemo<PolkadotWalletState>(
    () => ({
      walletAccount,
      setWalletAccount,
      removeWalletAccount
    }),
    [removeWalletAccount, setWalletAccount, walletAccount]
  );

  return <PolkadotWalletStateContext.Provider value={providerValue}>{children}</PolkadotWalletStateContext.Provider>;
};

const usePolkadotWalletState = () => {
  const state = useContext(PolkadotWalletStateContext);
  if (!state) throw "PolkadotWalletStateProvider not defined!";
  return state;
};

export { PolkadotWalletStateContext, PolkadotWalletStateProvider, usePolkadotWalletState };
