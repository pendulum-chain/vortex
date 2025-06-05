import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/20/solid';
import { Wallet, WalletAccount } from '@talismn/connect-wallets';
import { useTranslation } from 'react-i18next';

import { getAddressForFormat } from '@packages/shared';
import accountBalanceWalletIconPink from '../../../../assets/account-balance-wallet-pink.svg';
import accountBalanceWalletIcon from '../../../../assets/account-balance-wallet.svg';
import { useAssetHubNode } from '../../../../contexts/polkadotNode';
import { usePolkadotWalletState } from '../../../../contexts/polkadotWallet';
import { trimAddress } from '../../../../helpers/addressFormatter';
import { CopyablePublicKey } from '../../../PublicKey/CopyablePublicKey';

interface WalletButtonProps {
  address: string;
}

const WalletButton = ({ address }: WalletButtonProps) => (
  <button type="button" className="btn-vortex-secondary btn rounded-3xl group">
    <img src={accountBalanceWalletIcon} className="block group-hover:hidden" alt="wallet account button" />
    <img src={accountBalanceWalletIconPink} className="hidden group-hover:block" alt="wallet account button hovered" />
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
    <ul className="dropdown-content menu right-0 mt-2 min-w-[240px] border border-base-300 bg-base-200 p-3 text-center shadow-lg rounded-2xl">
      <li className="text-sm text-neutral-400">{walletAccount?.name}</li>
      <li className="mt-2 text-neutral-500">
        <CopyablePublicKey publicKey={address} variant="short" inline={true} />
      </li>
      <li>
        <button className="mt-2 text-base btn btn-sm bg-base-300" onClick={removeWalletAccount}>
          <ArrowLeftEndOnRectangleIcon className="w-5 mr-2" />
          {t('components.dialogs.polkadotDisconnectWallet.disconnect')}
        </button>
      </li>
    </ul>
  );
};

export const DisconnectModal = () => {
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
      <WalletDropdownMenu
        walletAccount={walletAccount}
        address={addressForNetwork}
        removeWalletAccount={removeWalletAccount}
      />
    </div>
  );
};
