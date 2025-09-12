import { cn } from "../../helpers/cn";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { ConnectWalletButton, WalletButtonVariant } from "../buttons/ConnectWalletButton";

export interface ConnectWalletSectionProps {
  className?: string;
}

export const ConnectWalletSection = ({ className }: ConnectWalletSectionProps) => {
  const { isConnected } = useVortexAccount();

  return (
    <div className={cn("mb-4 w-full", isConnected && "mb-2", className)}>
      {isConnected ? (
        <ConnectWalletButton customStyles="w-full" variant={WalletButtonVariant.Minimal} />
      ) : (
        <ConnectWalletButton customStyles="w-full" hideIcon />
      )}
    </div>
  );
};
