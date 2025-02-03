import { WalletAccount } from '@talismn/connect-wallets';
import { trimAddress } from '../../helpers/addressFormatter';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';

interface AccountProps {
  account: WalletAccount;
}

export const AccountCard = ({ account }: AccountProps) => {
  const { setWalletAccount } = usePolkadotWalletState();

  return (
    <li className="w-full">
      <button
        aria-label={`Select ${account.address}`}
        className="flex w-full cursor-pointer items-center rounded border-l-2 border-transparent p-1.5 hover:border-primary hover:bg-base-100"
        onClick={() => setWalletAccount(account)}
      >
        <p className="ml-2.5">
          {account.name} | {trimAddress(account.address)}
        </p>
      </button>
    </li>
  );
};
