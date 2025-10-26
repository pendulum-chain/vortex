import { Networks } from "@packages/shared";
import { cn } from "../../helpers/cn";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { ConnectWalletButton, WalletButtonVariant } from "../buttons/ConnectWalletButton";

export interface ConnectWalletSectionProps {
  className?: string;
  forceNetwork?: Networks;
}

export const ConnectWalletSection = ({ className, forceNetwork }: ConnectWalletSectionProps) => {
  const { isConnected } = useVortexAccount(forceNetwork);
  return (
    <div className={cn("mb-4 w-full", isConnected && "mb-2", className)}>
      {isConnected ? (
        <ConnectWalletButton customStyles="w-full" forceNetwork={forceNetwork} variant={WalletButtonVariant.Minimal} />
      ) : (
        <ConnectWalletButton customStyles="w-full" forceNetwork={forceNetwork} hideIcon />
      )}
    </div>
  );
};
