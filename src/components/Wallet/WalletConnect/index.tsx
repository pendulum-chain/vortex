import { WalletConnectModal } from '@walletconnect/modal';
import UniversalProvider from '@walletconnect/universal-provider';
import { SessionTypes } from '@walletconnect/types';
import { useCallback, useEffect, useState } from 'preact/compat';
import logo from '../../../assets/wallet-connect.svg';
import { chainIds, walletConnectConfig } from '../../../config/walletConnect';
import { config } from '../../../config';
import { walletConnectService } from '../../../services/walletConnect';
import { useGlobalState } from '../../../GlobalStateProvider';

const WalletConnect = () => {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Promise<UniversalProvider> | undefined>();
  const [modal, setModal] = useState<WalletConnectModal | undefined>();
  const { tenantName, setWalletAccount, removeWalletAccount } = useGlobalState();

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
    const chainId = chainIds[tenantName];
    if (!provider || !chainId) return;

    const wcProvider = await provider;
    const { uri, approval } = await wcProvider.client.connect(walletConnectConfig);

    handleModal(uri);
    handleSession(approval, chainId);
    await setupClientDisconnectListener(provider);
  }, [provider, tenantName, setupClientDisconnectListener, handleModal, handleSession]);

  const walletConnectClick = useCallback(async () => {
    setLoading(true);
    try {
      await handleConnect();

      //@eslint-disable-next-line no-explicit-any
    } catch (error: any) {
      console.log(error)
    } finally {
      setLoading(false);
    }
  }, [handleConnect]);

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
    <div className="-mt-8">
      <button
        className={`flex items-center gap-4 p-4 rounded-xl text-left w-full bg-[var(--modal-control-background)] hover:bg-[var(--modal-active-background)]`}
        onClick={walletConnectClick}
        disabled={loading}
      >
        <img src={logo} width="32" height="32" alt="Wallet Connect" />
        {loading ? 'Loading...' : 'Wallet connect'}
      </button>
    </div>
  );
};
export default WalletConnect;
