import { isNetworkEVM, Networks } from "@vortexfi/shared";
import { useNetwork } from "../../../contexts/network";
import { EVMWalletButton } from "../EVMWalletButton";
import { PolkadotWalletButton } from "../PolkadotWalletButton";

export enum WalletButtonVariant {
  Minimal = "MINIMAL",
  Standard = "STANDARD"
}

interface ConnectWalletButtonProps {
  customStyles?: string;
  hideIcon?: boolean;
  variant?: WalletButtonVariant;
  forceNetwork?: Networks;
}

export const ConnectWalletButton = ({
  customStyles,
  hideIcon,
  variant = WalletButtonVariant.Standard,
  forceNetwork
}: ConnectWalletButtonProps) => {
  const { selectedNetwork } = useNetwork();

  const isEVM = (forceNetwork && isNetworkEVM(forceNetwork)) || isNetworkEVM(selectedNetwork);
  const ButtonComponent = isEVM ? EVMWalletButton : PolkadotWalletButton;

  return <ButtonComponent customStyles={customStyles} forceNetwork={forceNetwork} hideIcon={hideIcon} variant={variant} />;
};
