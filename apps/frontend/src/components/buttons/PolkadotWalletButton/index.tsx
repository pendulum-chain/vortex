import { Networks } from "@vortexfi/shared";
import { usePolkadotWalletState } from "../../../contexts/polkadotWallet";
import { WalletButtonVariant } from "../ConnectWalletButton";
import { PolkadotConnectWallet } from "./PolkadotConnectWallet";
import { DisconnectModal } from "./PolkadotDisconnectWallet";

export function PolkadotWalletButton({
  customStyles,
  hideIcon,
  variant = WalletButtonVariant.Standard
}: {
  customStyles?: string;
  hideIcon?: boolean;
  variant?: WalletButtonVariant;
  forceNetwork?: Networks;
}) {
  const { walletAccount } = usePolkadotWalletState();

  return walletAccount ? (
    <DisconnectModal customStyles={customStyles} variant={variant} />
  ) : (
    <PolkadotConnectWallet customStyles={customStyles} hideIcon={hideIcon} variant={variant} />
  );
}
