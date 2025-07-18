import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { Wallet } from "@talismn/connect-wallets";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useConnectPolkadotWallet } from "../../hooks/useConnectPolkadotWallet";
import { Dialog } from "../Dialog";
import { ConnectModalAccountsList } from "./AccountsList";
import { PolkadotWalletSelectorDialogLoading } from "./PolkadotWalletSelectorDialogLoading";
import { ConnectModalWalletsList } from "./WalletsList";

interface PolkadotWalletSelectorDialogProps {
  visible: boolean;
  onClose: () => void;
}

export const PolkadotWalletSelectorDialog = ({ visible, onClose }: PolkadotWalletSelectorDialogProps) => {
  const { accounts, wallets, selectWallet, loading, selectedWallet } = useConnectPolkadotWallet();
  const [isAccountsCollapseOpen, setIsAccountsCollapseOpen] = useState(false);
  const { t } = useTranslation();

  const accountsContent = (
    <div className="collapse">
      <input checked={isAccountsCollapseOpen} onChange={() => setIsAccountsCollapseOpen(prev => !prev)} type="checkbox" />
      <div className="collapse-title flex items-center justify-between pr-4">
        <p>{t("components.dialogs.polkadotWalletSelectorDialog.chooseAccount")}</p>
        <motion.div animate={{ rotate: isAccountsCollapseOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDownIcon className="h-6 w-6" />
        </motion.div>
      </div>
      <div className="collapse-content">
        <ConnectModalAccountsList accounts={accounts || []} />
      </div>
    </div>
  );

  const walletsContent = (
    <div className="collapse-open collapse">
      <input defaultChecked type="checkbox" />
      <div className="collapse-title">{t("components.dialogs.polkadotWalletSelectorDialog.selectWallet")}</div>
      <div className="collapse-content">
        <ConnectModalWalletsList
          onClick={(wallet: Wallet) => {
            selectWallet(wallet);
            setIsAccountsCollapseOpen(true);
          }}
          onClose={onClose}
          wallets={wallets}
        />
      </div>
    </div>
  );

  const content = (
    <article className="flex flex-wrap gap-2">
      {walletsContent}
      {accounts?.length ? accountsContent : <></>}
    </article>
  );

  return loading ? (
    <Dialog
      content={
        <PolkadotWalletSelectorDialogLoading selectedWallet={selectedWallet?.title || selectedWallet?.extensionName || ""} />
      }
      onClose={() => {
        selectWallet(undefined);
        onClose();
      }}
      visible={visible}
    />
  ) : (
    <Dialog
      content={content}
      headerText={t("components.dialogs.polkadotWalletSelectorDialog.title")}
      onClose={() => {
        selectWallet(undefined);
        onClose();
      }}
      visible={visible}
    />
  );
};
