import { WalletAccount } from '@talismn/connect-wallets';
import { trimAddress } from '../../helpers/addressFormatter';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { getAddressForFormat } from 'shared';

interface AccountProps {
  account: WalletAccount;
}

export const AccountCard = ({ account }: AccountProps) => {
  const { setWalletAccount } = usePolkadotWalletState();
  const { apiComponents } = useAssetHubNode();

  const ss58Format = apiComponents ? apiComponents.ss58Format : 42;
  const addressForNetwork = getAddressForFormat(account.address, ss58Format);

  return (
    <li className="w-full">
      <button
        aria-label={`Select ${addressForNetwork}`}
        className="flex w-full cursor-pointer items-center rounded border-l-2 border-transparent p-1.5 hover:border-primary hover:bg-base-100"
        onClick={() => setWalletAccount(account)}
      >
        <p className="ml-2.5">
          {account.name} | {trimAddress(addressForNetwork)}
        </p>
      </button>
    </li>
  );
};
