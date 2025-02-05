import { Wallet, WalletAccount } from '@talismn/connect-wallets';
import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/20/solid';

import accountBalanceWalletIcon from '../../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../../assets/account-balance-wallet-pink.svg';
import { trimAddress } from '../../../../helpers/addressFormatter';
import { CopyablePublicKey } from '../../../PublicKey/CopyablePublicKey';
import { usePolkadotWalletState } from '../../../../contexts/polkadotWallet';

interface WalletButtonProps {
  wallet?: Wallet;
  balance?: string;
  tokenSymbol?: string;
  walletAccount?: WalletAccount;
}

const WalletButton = ({ walletAccount }: WalletButtonProps) => (
  <button type="button" className="btn-vortex-secondary btn rounded-3xl group">
    <img src={accountBalanceWalletIcon} className="block group-hover:hidden" alt="wallet account button" />
    <img src={accountBalanceWalletIconPink} className="hidden group-hover:block" alt="wallet account button hovered" />
    <p className="hidden font-thin md:block ">{walletAccount ? trimAddress(walletAccount.address) : ''}</p>
  </button>
);

interface WalletDropdownMenuProps {
  address: string;
  balance?: string;
  tokenSymbol?: string;
  walletAccount?: WalletAccount;
  removeWalletAccount: () => void;
}

const WalletDropdownMenu = ({ walletAccount, address, removeWalletAccount }: WalletDropdownMenuProps) => (
  <ul className="dropdown-content menu right-0 mt-2 min-w-[240px] border border-base-300 bg-base-200 p-3 text-center shadow-lg rounded-2xl">
    <li className="text-sm text-neutral-400">{walletAccount?.name}</li>
    <li className="mt-2 text-neutral-500">
      <CopyablePublicKey publicKey={address} variant="short" inline={true} />
    </li>
    <li>
      <button className="mt-2 text-base btn btn-sm bg-base-300" onClick={removeWalletAccount}>
        <ArrowLeftEndOnRectangleIcon className="w-5 mr-2" />
        Disconnect
      </button>
    </li>
  </ul>
);

export const DisconnectModal = () => {
  const { walletAccount, removeWalletAccount } = usePolkadotWalletState();
  const { wallet, address } = walletAccount || {};

  if (!address) return <></>;

  return (
    <div className="dropdown dropdown-bottom" role="listbox">
      <label tabIndex={0}>
        <WalletButton wallet={wallet} balance={'0'} tokenSymbol={'$'} walletAccount={walletAccount} />
      </label>
      <WalletDropdownMenu walletAccount={walletAccount} address={address} removeWalletAccount={removeWalletAccount} />
    </div>
  );
};
