import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/20/solid";
import { getAddressForFormat } from "@packages/shared";
import { Wallet, WalletAccount } from "@talismn/connect-wallets";
import { useTranslation } from "react-i18next";
import accountBalanceWalletIcon from "../../../../assets/account-balance-wallet.svg";
import accountBalanceWalletIconPink from "../../../../assets/account-balance-wallet-pink.svg";
import { useAssetHubNode } from "../../../../contexts/polkadotNode";
import { usePolkadotWalletState } from "../../../../contexts/polkadotWallet";
import { trimAddress } from "../../../../helpers/addressFormatter";
import { CopyablePublicKey } from "../../../PublicKey/CopyablePublicKey";
import { WalletButtonVariant } from "../../ConnectWalletButton";

interface WalletButtonProps {
  address: string;
}

const WalletButton = ({ address }: WalletButtonProps) => (
  <button className="btn-vortex-secondary btn group rounded-3xl" type="button">
    <img alt="wallet account button" className="block group-hover:hidden" src={accountBalanceWalletIcon} />
    <img alt="wallet account button hovered" className="hidden group-hover:block" src={accountBalanceWalletIconPink} />
    <p className="hidden font-thin md:block ">{trimAddress(address)}</p>
  </button>
);

interface WalletDropdownMenuProps {
  address: string;
  balance?: string;
  tokenSymbol?: string;
  walletAccount?: WalletAccount;
  removeWalletAccount: () => void;
}

const WalletDropdownMenu = ({ walletAccount, address, removeWalletAccount }: WalletDropdownMenuProps) => {
  const { t } = useTranslation();

  return (
    <ul className="dropdown-content menu right-0 mt-2 min-w-[240px] rounded-2xl border border-base-300 bg-base-200 p-3 text-center shadow-lg">
      <li className="text-neutral-400 text-sm">{walletAccount?.name}</li>
      <li className="mt-2 text-neutral-500">
        <CopyablePublicKey inline={true} publicKey={address} variant="short" />
      </li>
      <li>
        <button className="btn btn-sm mt-2 bg-base-300 text-base" onClick={removeWalletAccount}>
          <ArrowLeftEndOnRectangleIcon className="mr-2 w-5" />
          {t("components.dialogs.polkadotDisconnectWallet.disconnect")}
        </button>
      </li>
    </ul>
  );
};

export const DisconnectModal = ({ variant = WalletButtonVariant.Standard }: { variant?: WalletButtonVariant }) => {
  const { walletAccount, removeWalletAccount } = usePolkadotWalletState();
  const { apiComponents } = useAssetHubNode();
  const { address } = walletAccount || {};

  if (!address) return <></>;

  const ss58Format = apiComponents ? apiComponents.ss58Format : 42;
  const addressForNetwork = getAddressForFormat(address, ss58Format);

  return (
    <div className="dropdown dropdown-bottom" role="listbox">
      <label tabIndex={0}>
        <WalletButton address={addressForNetwork} />
      </label>
      <WalletDropdownMenu address={addressForNetwork} removeWalletAccount={removeWalletAccount} walletAccount={walletAccount} />
    </div>
  );
};
