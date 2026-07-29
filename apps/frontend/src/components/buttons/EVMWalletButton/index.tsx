import { useAppKit, useAppKitNetwork } from "@reown/appkit/react";
import { isNetworkEVM, Networks } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { wagmiConfig } from "../../../wagmiConfig";
import { useWidgetWallet } from "../../../wallets/WidgetWalletContext";
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
  const wallet = useWidgetWallet();
  const { caipNetwork: appkitNetwork, switchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { t } = useTranslation();

  const isOnSupportedNetwork =
    (forceNetwork && isNetworkEVM(forceNetwork)) || wagmiConfig.chains.find(chain => chain.id === walletChainId) !== undefined;

  if (!wallet.connected) {
    return (
      <div className="grid gap-2">
        <BaseWalletButton
          customStyles={customStyles}
          hideIcon={hideIcon}
          onClick={() => {
            void wallet.connectExternalWallet();
          }}
          showPlayIcon
          variant={variant}
        >
          <p className="flex">
            {t("components.dialogs.connectWallet.connect")} <span className="hidden sm:ml-1 sm:block">Wallet</span>
          </p>
        </BaseWalletButton>
        {wallet.canUseEmbeddedWallet && (
          <BaseWalletButton
            customStyles={customStyles}
            hideIcon={hideIcon}
            onClick={wallet.createEmbeddedWallet}
            showPlayIcon
            variant={variant}
          >
            Use a Vortex wallet
          </BaseWalletButton>
        )}
        {wallet.embeddedUnavailableReason && (
          <p className="text-center text-gray-500 text-xs">{wallet.embeddedUnavailableReason}</p>
        )}
      </div>
    );
  }

  if (wallet.mode !== "cdp_embedded" && !isOnSupportedNetwork) {
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
        if (wallet.mode !== "cdp_embedded") open({ view: "Account" });
      }}
      variant={variant}
    />
  );
}
