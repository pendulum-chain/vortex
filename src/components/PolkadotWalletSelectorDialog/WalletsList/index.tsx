import { Wallet } from '@talismn/connect-wallets';
import { useTranslation } from 'react-i18next';

import { WalletsListItem } from './WalletsListItem';
import { WalletConnect } from '../WalletConnect';

interface ConnectWalletListProps {
  wallets?: Wallet[];
  onClick: (wallet: Wallet) => void;
  onClose: () => void;
}

export function ConnectModalWalletsList({ wallets, onClick, onClose }: ConnectWalletListProps) {
  const { t } = useTranslation();

  if (!wallets?.length) {
    return <p>{t('components.polkadotWalletSelectorDialog.noWalletInstalled')}</p>;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {wallets.map((wallet: Wallet) => (
        <WalletsListItem key={wallet.title} wallet={wallet} onClick={onClick} />
      ))}
      <WalletConnect onClick={onClose} />
    </section>
  );
}
