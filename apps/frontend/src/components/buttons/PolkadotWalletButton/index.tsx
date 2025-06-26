import { usePolkadotWalletState } from "../../../contexts/polkadotWallet";
import { PolkadotConnectWallet } from "./PolkadotConnectWallet";
import { DisconnectModal } from "./PolkadotDisconnectWallet";

export function PolkadotWalletButton({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) {
  const { walletAccount } = usePolkadotWalletState();

  return walletAccount ? <DisconnectModal /> : <PolkadotConnectWallet customStyles={customStyles} hideIcon={hideIcon} />;
}
