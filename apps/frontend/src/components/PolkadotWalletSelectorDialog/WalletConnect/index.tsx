import { WalletConnectModal } from "@walletconnect/modal";
import { SessionTypes } from "@walletconnect/types";
import UniversalProvider from "@walletconnect/universal-provider";
import { useCallback, useEffect, useState } from "react";

import logo from "../../../assets/wallets/wallet-connect.svg";
import { config } from "../../../config";
import { WALLETCONNECT_ASSETHUB_ID } from "../../../constants/constants";
import { useNetwork } from "../../../contexts/network";
import { usePolkadotWalletState } from "../../../contexts/polkadotWallet";
import { useToastMessage } from "../../../helpers/notifications";
import { walletConnectService } from "./WalletConnectService";

export const walletConnectConfig = {
  optionalNamespaces: {
    polkadot: {
      chains: [WALLETCONNECT_ASSETHUB_ID],
      events: ["chainChanged", "accountsChanged"],
      methods: ["polkadot_signTransaction", "polkadot_signMessage"]
    }
  },
  requiredNamespaces: {
    polkadot: {
      chains: [WALLETCONNECT_ASSETHUB_ID],
      events: ["chainChanged", "accountsChanged"],
      methods: ["polkadot_signTransaction", "polkadot_signMessage"]
    }
  }
};

interface WalletConnectProps {
  onClick: () => void;
}

export const WalletConnect = ({ onClick }: WalletConnectProps) => {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<Promise<UniversalProvider> | undefined>();
  const [modal, setModal] = useState<WalletConnectModal | undefined>();
  const { setWalletAccount, removeWalletAccount } = usePolkadotWalletState();
  const { walletConnectPolkadotSelectedNetworkId } = useNetwork();

  const { showToast, ToastMessage } = useToastMessage();

  const setupClientDisconnectListener = useCallback(
    async (provider: Promise<UniversalProvider>) => {
      (await provider).client.on("session_delete", () => {
        removeWalletAccount();
      });
    },
    [removeWalletAccount]
  );

  const handleModal = useCallback(
    (uri?: string) => {
      if (uri) {
        modal?.openModal({ onclose: () => setLoading(false), uri });
      }
    },
    [modal]
  );

  const handleSession = useCallback(
    async (approval: () => Promise<SessionTypes.Struct>, chainId: string) => {
      const session = await approval();
      setWalletAccount(await walletConnectService.init(session, chainId));
      modal?.closeModal();
    },
    [setWalletAccount, modal]
  );

  const handleConnect = useCallback(async () => {
    if (!provider || !walletConnectPolkadotSelectedNetworkId) return;

    const wcProvider = await provider;
    const { uri, approval } = await wcProvider.client.connect(walletConnectConfig);

    handleModal(uri);
    handleSession(approval, walletConnectPolkadotSelectedNetworkId);
    await setupClientDisconnectListener(provider);
  }, [provider, walletConnectPolkadotSelectedNetworkId, setupClientDisconnectListener, handleModal, handleSession]);

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
  }, [handleConnect, onClick, showToast, ToastMessage.ERROR]);

  useEffect(() => {
    if (provider) return;
    setProvider(walletConnectService.getProvider());
    setModal(
      new WalletConnectModal({
        projectId: config.walletConnect.projectId
      })
    );
  }, [provider]);

  return (
    <button
      className="btn flex w-full justify-center border-0 shadow-xs outline-primary md:justify-start"
      disabled={loading}
      onClick={walletConnectClick}
    >
      <img alt="WalletConnect connect button" height={32} src={logo} width={32} />
      <p className="ml-2">{loading ? "Loading..." : "Wallet Connect"}</p>
    </button>
  );
};
