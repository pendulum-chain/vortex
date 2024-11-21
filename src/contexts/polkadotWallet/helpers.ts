import { getWalletBySource, WalletAccount } from '@talismn/connect-wallets';
import { getSdkError } from '@walletconnect/utils';

import { LocalStorageKeys } from '../../hooks/useLocalStorage';
import { walletConnectService } from '../../components/PolkadotWalletSelectorDialog/WalletConnect/WalletConnectService';
import { storageService } from '../../services/storage/local';

const initTalisman = async (dAppName: string, selected?: string) => {
  const name = storageService.get(LocalStorageKeys.SELECTED_POLKADOT_WALLET);
  if (!name?.length) return;
  const wallet = getWalletBySource(name);
  if (!wallet) return;
  await wallet.enable(dAppName);
  const accounts = await wallet.getAccounts();
  return accounts.find((a) => a.address === selected) || accounts[0];
};

const initWalletConnect = async (chainId: string) => {
  const provider = await walletConnectService.getProvider();
  if (!provider?.session) return;
  return await walletConnectService.init(provider?.session, chainId);
};

export const initSelectedWallet = async (storageAddress: string) => {
  const appName = 'Vortex';

  const assetHubId = 'polkadot:68d56f15f85d3136970ec16946040bc1'; //@todo
  return (await initTalisman(appName, storageAddress)) || (await initWalletConnect(assetHubId));
};

export const handleWalletConnectDisconnect = async (walletAccount: WalletAccount | undefined) => {
  if (walletAccount?.wallet?.extensionName === 'WalletConnect') {
    const topic = walletConnectService.session?.topic;
    if (topic) {
      await walletConnectService.provider?.client.disconnect({
        topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });
    }
  }
};
