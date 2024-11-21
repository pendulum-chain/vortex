import { Wallet, WalletAccount } from '@talismn/connect-wallets';
import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/20/solid';
import { Button, Dropdown } from 'react-daisyui';

import accountBalanceWalletIcon from '../../../../assets/account-balance-wallet.svg';
import accountBalanceWalletIconPink from '../../../../assets/account-balance-wallet-pink.svg';
import { getAddressForFormat, trimAddress } from '../../../../helpers/addressFormatter';
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
  ss58Format?: number;
  removeWalletAccount: () => void;
}

const WalletDropdownMenu = ({ walletAccount, ss58Format, address, removeWalletAccount }: WalletDropdownMenuProps) => (
  <Dropdown.Menu className="right-0 mt-2 min-w-[240px] border border-base-300 bg-base-200 p-3 text-center shadow-lg">
    <div className="text-sm text-neutral-400">{walletAccount?.name}</div>
    <div className="text-neutral-500">
      <CopyablePublicKey
        publicKey={ss58Format ? getAddressForFormat(address, ss58Format) : address}
        variant="short"
        inline={true}
      />
    </div>
    <Button className="bg-base-300" size="sm" onClick={removeWalletAccount}>
      <ArrowLeftEndOnRectangleIcon className="w-5 mr-2" />
      Disconnect
    </Button>
  </Dropdown.Menu>
);

export const DisconnectModal = () => {
  const { walletAccount, removeWalletAccount } = usePolkadotWalletState();
  const { wallet, address } = walletAccount || {};

  if (!address) return <></>;

  return (
    <Dropdown vertical="bottom">
      <WalletButton wallet={wallet} balance={'0'} tokenSymbol={'$'} walletAccount={walletAccount} />
      <WalletDropdownMenu walletAccount={walletAccount} address={address} removeWalletAccount={removeWalletAccount} />
    </Dropdown>
  );
};
