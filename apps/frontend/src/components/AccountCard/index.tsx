import { getAddressForFormat } from "@packages/shared";
import { WalletAccount } from "@talismn/connect-wallets";
import { useAssetHubNode } from "../../contexts/polkadotNode";
import { usePolkadotWalletState } from "../../contexts/polkadotWallet";
import { trimAddress } from "../../helpers/addressFormatter";

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
        className="flex w-full cursor-pointer items-center rounded border-transparent border-l-2 p-1.5 hover:border-primary hover:bg-base-100"
        onClick={() => setWalletAccount(account)}
      >
        <p className="ml-2.5">
          {account.name} | {trimAddress(addressForNetwork)}
        </p>
      </button>
    </li>
  );
};
