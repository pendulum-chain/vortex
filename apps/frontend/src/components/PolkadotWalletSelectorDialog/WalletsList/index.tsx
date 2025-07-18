import { Wallet } from "@talismn/connect-wallets";
import { useTranslation } from "react-i18next";

import { WalletConnect } from "../WalletConnect";
import { WalletsListItem } from "./WalletsListItem";

interface ConnectWalletListProps {
  wallets?: Wallet[];
  onClick: (wallet: Wallet) => void;
  onClose: () => void;
}

export function ConnectModalWalletsList({ wallets, onClick, onClose }: ConnectWalletListProps) {
  const { t } = useTranslation();

  if (!wallets?.length) {
    return <p>{t("components.polkadotWalletSelectorDialog.noWalletInstalled")}</p>;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {wallets.map((wallet: Wallet) => (
        <WalletsListItem key={wallet.title} onClick={onClick} wallet={wallet} />
      ))}
      <WalletConnect onClick={onClose} />
    </section>
  );
}
