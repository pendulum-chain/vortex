import { WalletConnectModal } from '@walletconnect/modal';
import UniversalProvider from '@walletconnect/universal-provider';
import { SessionTypes } from '@walletconnect/types';
import { Button } from 'react-daisyui';
import { useCallback, useEffect, useState } from 'preact/hooks';

import logo from '../../../assets/wallets/wallet-connect.svg';
import { config } from '../../../config';
import { showToast, ToastMessage } from '../../../helpers/notifications';
import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { useNetwork } from '../../../contexts/network';
import { walletConnectService } from './WalletConnectService';

const assetHubId = 'polkadot:68d56f15f85d3136970ec16946040bc1'; //@todo

export const walletConnectConfig = {
  requiredNamespaces: {
    polkadot: {
      methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
      events: ['chainChanged', 'accountsChanged'],
      chains: [assetHubId],
    },
  },
  optionalNamespaces: {
    polkadot: {
      methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
      events: ['chainChanged', 'accountsChanged'],
      chains: [assetHubId],
    },
  },
};

interface WalletConnectProps {
  onClick: () => void;
}

export const WalletConnect = ({ onClick }: WalletConnectProps) => {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Promise<UniversalProvider> | undefined>();
  const [modal, setModal] = useState<WalletConnectModal | undefined>();
  const { setWalletAccount, removeWalletAccount } = usePolkadotWalletState();
  const { polkadotSelectedNetworkId } = useNetwork();

  const setupClientDisconnectListener = useCallback(
    async (provider: Promise<UniversalProvider>) => {
      (await provider).client.on('session_delete', () => {
        removeWalletAccount();
      });
    },
    [removeWalletAccount],
  );

  const handleModal = useCallback(
    (uri?: string) => {
      if (uri) {
        modal?.openModal({ uri, onclose: () => setLoading(false) });
      }
    },
    [modal],
  );

  const handleSession = useCallback(
    async (approval: () => Promise<SessionTypes.Struct>, chainId: string) => {
      const session = await approval();
      setWalletAccount(await walletConnectService.init(session, chainId));
      modal?.closeModal();
    },
    [setWalletAccount, modal],
  );

  const handleConnect = useCallback(async () => {
    if (!provider || !polkadotSelectedNetworkId) return;

    const wcProvider = await provider;
    const { uri, approval } = await wcProvider.client.connect(walletConnectConfig);

    handleModal(uri);
    handleSession(approval, polkadotSelectedNetworkId);
    await setupClientDisconnectListener(provider);
  }, [provider, polkadotSelectedNetworkId, setupClientDisconnectListener, handleModal, handleSession]);

  const walletConnectClick = useCallback(async () => {
    setLoading(true);
    try {
      await handleConnect();
    } catch (error: unknown) {
      showToast(ToastMessage.ERROR, error as string);
    } finally {
      setLoading(false);
      onClick();
    }
  }, [handleConnect, onClick]);

  useEffect(() => {
    if (provider) return;
    setProvider(walletConnectService.getProvider());
    setModal(
      new WalletConnectModal({
        projectId: config.walletConnect.projectId,
      }),
    );
  }, [provider]);

  return (
    <Button
      className="flex justify-center w-full outline-primary md:justify-start"
      onClick={walletConnectClick}
      disabled={loading}
    >
      <img src={logo} alt="WalletConnect connect button" width={32} height={32} />
      <p className="ml-2">{loading ? 'Loading...' : 'Wallet Connect'}</p>
    </Button>
  );
};
