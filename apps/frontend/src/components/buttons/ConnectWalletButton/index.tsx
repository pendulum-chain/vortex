import { isNetworkEVM } from "@packages/shared";
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
}

export const ConnectWalletButton = ({
  customStyles,
  hideIcon,
  variant = WalletButtonVariant.Standard
}: ConnectWalletButtonProps) => {
  const { selectedNetwork } = useNetwork();

  if (isNetworkEVM(selectedNetwork)) {
    return <EVMWalletButton customStyles={customStyles} hideIcon={hideIcon} variant={variant} />;
  }

  return <PolkadotWalletButton customStyles={customStyles} hideIcon={hideIcon} variant={variant} />;
};
