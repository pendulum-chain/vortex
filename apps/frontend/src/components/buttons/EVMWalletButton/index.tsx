import { EvmNetworks, isNetworkEVM, Networks } from "@packages/shared";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useTranslation } from "react-i18next";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { wagmiConfig } from "../../../wagmiConfig";
import { WalletButtonVariant } from "../ConnectWalletButton";
import { BaseWalletButton } from "../ConnectWalletButton/BaseWalletButton";

export function EVMWalletButton({
  customStyles,
  hideIcon,
  variant = WalletButtonVariant.Standard,
  forceNetwork
}: {
  customStyles?: string;
  hideIcon?: boolean;
  variant?: WalletButtonVariant;
  forceNetwork?: Networks;
}) {
  const { address, chainId: walletChainId } = useVortexAccount(forceNetwork);
  const { isConnected } = useAppKitAccount();
  const { caipNetwork: appkitNetwork, switchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { t } = useTranslation();

  const isOnSupportedNetwork =
    (forceNetwork && isNetworkEVM(forceNetwork)) || wagmiConfig.chains.find(chain => chain.id === walletChainId) !== undefined;

  if (!isConnected) {
    return (
      <BaseWalletButton
        customStyles={customStyles}
        hideIcon={hideIcon}
        onClick={() => {
          open({ view: "Connect" });
        }}
        showPlayIcon
        variant={variant}
      >
        <p className="flex">
          {t("components.dialogs.connectWallet.connect")} <span className="hidden sm:ml-1 sm:block">Wallet</span>
        </p>
      </BaseWalletButton>
    );
  }

  if (!isOnSupportedNetwork) {
    return (
      <BaseWalletButton
        hideIcon={hideIcon}
        onClick={() => {
          if (appkitNetwork) {
            switchNetwork(appkitNetwork);
          }
        }}
        showPlayIcon
        variant={variant}
      >
        {t("components.dialogs.connectWallet.wrongNetwork")}
      </BaseWalletButton>
    );
  }

  return (
    <BaseWalletButton
      address={address}
      customStyles={customStyles}
      hideIcon={hideIcon}
      onClick={() => {
        open({ view: "Account" });
      }}
      variant={variant}
    />
  );
}
