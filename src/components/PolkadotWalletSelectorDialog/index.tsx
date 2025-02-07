import { Wallet } from '@talismn/connect-wallets';
import { Collapse } from 'react-daisyui';
import { useState } from 'react';

import { useConnectPolkadotWallet } from '../../hooks/useConnectPolkadotWallet';
import { ConnectModalAccountsList } from './AccountsList';
import { PolkadotWalletSelectorDialogLoading } from './PolkadotWalletSelectorDialogLoading';
import { ConnectModalWalletsList } from './WalletsList';
import { Dialog } from '../Dialog';

interface PolkadotWalletSelectorDialogProps {
  visible: boolean;
  onClose: () => void;
}

export const PolkadotWalletSelectorDialog = ({ visible, onClose }: PolkadotWalletSelectorDialogProps) => {
  const { accounts, wallets, selectWallet, loading, selectedWallet } = useConnectPolkadotWallet();
  const [isAccountsCollapseOpen, setIsAccountsCollapseOpen] = useState(false);

  const accountsContent = (
    <Collapse defaultChecked icon="arrow" open={isAccountsCollapseOpen}>
      <Collapse.Title onClick={() => setIsAccountsCollapseOpen((state) => !state)}>Choose Account</Collapse.Title>
      <Collapse.Content>
        <ConnectModalAccountsList accounts={accounts || []} />
      </Collapse.Content>
    </Collapse>
  );

  const walletsContent = (
    <Collapse defaultChecked open>
      <Collapse.Title>Select Wallet</Collapse.Title>
      <Collapse.Content>
        <ConnectModalWalletsList
          wallets={wallets}
          onClick={(wallet: Wallet) => {
            selectWallet(wallet);
            setIsAccountsCollapseOpen(true);
          }}
          onClose={onClose}
        />
      </Collapse.Content>
    </Collapse>
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
      headerText="Connect wallet"
      onClose={() => {
        selectWallet(undefined);
        onClose();
      }}
      content={content}
    />
  );
};
