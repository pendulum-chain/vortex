import { Wallet, getWallets } from "@talismn/connect-wallets";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useToastMessage } from "../../helpers/notifications";
import { storageService } from "../../services/storage/local";
import { LocalStorageKeys } from "../useLocalStorage";

declare global {
  interface Window {
    walletExtension: {
      isNovaWallet: boolean;
    };
  }
}

const alwaysShowWallets = ["talisman", "subwallet-js", "polkadot-js"];

function filterNovaWallet(wallet: Wallet) {
  const isNovaWallet = window.walletExtension?.isNovaWallet;
  return isNovaWallet || wallet.title !== "Nova Wallet";
}

function getFilteredWallets() {
  const wallets = getWallets();

  return wallets
    .filter(wallet => alwaysShowWallets.includes(wallet.extensionName) || wallet.installed)
    .filter(filterNovaWallet);
}

export const useConnectPolkadotWallet = () => {
  const [selectedWallet, setSelectedWallet] = useState<Wallet | undefined>();
  const { showToast, ToastMessage } = useToastMessage();
  const wallets = getFilteredWallets();

  const {
    mutate: selectWallet,
    data: accounts,
    isPending: loading
  } = useMutation({
    mutationFn: async (wallet: Wallet | undefined) => {
      setSelectedWallet(wallet);
      if (!wallet) return [];
      try {
        await wallet.enable("Vortex");

        if (wallet.installed) {
          storageService.set(LocalStorageKeys.SELECTED_POLKADOT_WALLET, wallet.extensionName);
        }

        return wallet.getAccounts();
      } catch {
        showToast(ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION);
        return [];
      }
    }
  });

  return { accounts, wallets, selectWallet, loading, selectedWallet };
};
