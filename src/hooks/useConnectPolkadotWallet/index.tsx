import { useState } from 'react';
import { Wallet, getWallets } from '@talismn/connect-wallets';
import { useMutation } from '@tanstack/react-query';

import { ToastMessage, showToast } from '../../helpers/notifications';
import { storageService } from '../../services/storage/local';
import { LocalStorageKeys } from '../useLocalStorage';

const alwaysShowWallets = ['talisman', 'subwallet-js', 'polkadot-js'];

export const useConnectPolkadotWallet = () => {
  const [selectedWallet, setSelectedWallet] = useState<Wallet | undefined>();

  const wallets = getWallets().filter((wallet) => alwaysShowWallets.includes(wallet.extensionName) || wallet.installed);

  const {
    mutate: selectWallet,
    data: accounts,
    isPending: loading,
  } = useMutation({
    mutationFn: async (wallet: Wallet | undefined) => {
      setSelectedWallet(wallet);
      if (!wallet) return [];
      try {
        await wallet.enable('Vortex');

        if (wallet.installed) {
          storageService.set(LocalStorageKeys.SELECTED_POLKADOT_WALLET, wallet.extensionName);
        }

        return wallet.getAccounts();
      } catch {
        showToast(ToastMessage.POLKADOT_WALLET_ALREADY_OPEN_PENDING_CONNECTION);
        return [];
      }
    },
  });

  return { accounts, wallets, selectWallet, loading, selectedWallet };
};
