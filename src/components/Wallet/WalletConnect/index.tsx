import { WalletConnectModal } from '@walletconnect/modal';
import UniversalProvider from '@walletconnect/universal-provider';
import { useCallback, useEffect, useState } from 'preact/compat';
import { toast } from 'react-toastify';
import { GlobalState, useGlobalState } from '../../../GlobalStateProvider';
import logo from '../../../assets/wallet-connect.svg';
import { config } from '../../../config';
import { chainIds, walletConnectConfig } from '../../../config/walletConnect';
import { walletConnectService } from '../../../services/walletConnect';

export type WalletConnectProps = {
  setWalletAccount: GlobalState['setWalletAccount'];
};

const WalletConnect = ({ setWalletAccount }: WalletConnectProps) => {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Promise<UniversalProvider> | undefined>();
  const [modal, setModal] = useState<WalletConnectModal | undefined>();
  const { tenantName } = useGlobalState();

  const walletConnectClick = useCallback(async () => {
    setLoading(true);
    try {
      const chainId = chainIds[tenantName];
      if (!provider || !chainId) return;

      const wcProvider = await provider;
      const { uri, approval } = await wcProvider.client.connect(walletConnectConfig);
      // if there is a URI from the client connect step open the modal
      if (uri) {
        modal?.openModal({ uri, onclose: () => setLoading(false) });
      }
      const session = await approval();
      setWalletAccount(await walletConnectService.init(session, chainId));
      modal?.closeModal();
      setLoading(false);
    } catch (error) {
      toast(error, { type: 'error' });
      setLoading(false);
    }
  }, [modal, provider, setWalletAccount, tenantName]);

  useEffect(() => {
    if (provider) return;
    setProvider(walletConnectService.getProvider());
    setModal(
      new WalletConnectModal({
        projectId: config.walletConnect.projectId,
        walletConnectVersion: 2,
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
