import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { PolkadotConnectWallet } from './PolkadotConnectWallet';
import { DisconnectModal } from './PolkadotDisconnectWallet';

export function PolkadotWalletButton() {
  const { walletAccount } = usePolkadotWalletState();

  return walletAccount ? <DisconnectModal /> : <PolkadotConnectWallet />;
}
