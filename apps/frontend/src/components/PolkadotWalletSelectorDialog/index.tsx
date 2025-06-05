import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Wallet } from '@talismn/connect-wallets';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConnectPolkadotWallet } from '../../hooks/useConnectPolkadotWallet';
import { Dialog } from '../Dialog';
import { ConnectModalAccountsList } from './AccountsList';
import { PolkadotWalletSelectorDialogLoading } from './PolkadotWalletSelectorDialogLoading';
import { ConnectModalWalletsList } from './WalletsList';
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
      <input
        type="checkbox"
        checked={isAccountsCollapseOpen}
        onChange={() => setIsAccountsCollapseOpen((prev) => !prev)}
      />
      <div className="flex items-center justify-between pr-4 collapse-title">
        <p>{t('components.dialogs.polkadotWalletSelectorDialog.chooseAccount')}</p>
        <motion.div animate={{ rotate: isAccountsCollapseOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDownIcon className="w-6 h-6" />
        </motion.div>
      </div>
      <div className="collapse-content">
        <ConnectModalAccountsList accounts={accounts || []} />
      </div>
    </div>
  );

  const walletsContent = (
    <div className="collapse collapse-open">
      <input type="checkbox" defaultChecked />
      <div className="collapse-title">{t('components.dialogs.polkadotWalletSelectorDialog.selectWallet')}</div>
      <div className="collapse-content">
        <ConnectModalWalletsList
          wallets={wallets}
          onClick={(wallet: Wallet) => {
            selectWallet(wallet);
            setIsAccountsCollapseOpen(true);
          }}
          onClose={onClose}
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
      visible={visible}
      content={
        <PolkadotWalletSelectorDialogLoading
          selectedWallet={selectedWallet?.title || selectedWallet?.extensionName || ''}
        />
      }
      onClose={() => {
        selectWallet(undefined);
        onClose();
      }}
    />
  ) : (
    <Dialog
      visible={visible}
      headerText={t('components.dialogs.polkadotWalletSelectorDialog.title')}
      onClose={() => {
        selectWallet(undefined);
        onClose();
      }}
      content={content}
    />
  );
};
