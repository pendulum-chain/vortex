import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PolkadotWalletSelectorDialog } from "../../../PolkadotWalletSelectorDialog";
import { WalletButtonVariant } from "../../ConnectWalletButton";
import { BaseWalletButton } from "../../ConnectWalletButton/BaseWalletButton";

export const PolkadotConnectWallet = ({
  customStyles,
  hideIcon,
  variant = WalletButtonVariant.Standard
}: {
  customStyles?: string;
  hideIcon?: boolean;
  variant?: WalletButtonVariant;
}) => {
  const [showPolkadotDialog, setShowPolkadotDialog] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <BaseWalletButton
        customStyles={customStyles}
        hideIcon={hideIcon}
        onClick={() => {
          setShowPolkadotDialog(true);
        }}
        showPlayIcon
        variant={variant}
      >
        <p className="flex">
          {t("components.dialogs.connectWallet.connect")} <span className="hidden lg:ml-1 lg:block">Wallet</span>
        </p>
      </BaseWalletButton>
      <PolkadotWalletSelectorDialog onClose={() => setShowPolkadotDialog(false)} visible={showPolkadotDialog} />
    </>
  );
};
