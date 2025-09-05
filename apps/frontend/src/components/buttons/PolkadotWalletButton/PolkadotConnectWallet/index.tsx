import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../../helpers/cn";
import { PolkadotWalletSelectorDialog } from "../../../PolkadotWalletSelectorDialog";
import { WalletButtonVariant } from "../../ConnectWalletButton";

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
      <button
        className={cn("btn group rounded-3xl", customStyles || "btn-vortex-secondary")}
        onClick={() => {
          setShowPolkadotDialog(true);
        }}
        type="button"
      >
        <p className="flex">
          {t("components.dialogs.connectWallet.connect")} <span className="hidden lg:ml-1 lg:block">Wallet</span>
        </p>
        {hideIcon ? <></> : <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
      </button>
      <PolkadotWalletSelectorDialog onClose={() => setShowPolkadotDialog(false)} visible={showPolkadotDialog} />
    </>
  );
};
