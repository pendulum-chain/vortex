import { Wallet } from '@talismn/connect-wallets';
import { Button } from 'react-daisyui';

interface WalletsListItemProps {
  wallet: Wallet;
  onClick: (wallet: Wallet) => void;
}

function buttonOnClick(props: WalletsListItemProps) {
  const { wallet, onClick } = props;

  return wallet.installed ? onClick?.(wallet) : window.open(wallet.installUrl, '_blank', 'noopener,noreferrer');
}

export const WalletsListItem = (props: WalletsListItemProps) => (
  <Button
    key={props.wallet.extensionName}
    className="flex justify-center w-full outline-primary md:justify-start"
    onClick={() => buttonOnClick(props)}
  >
    <img src={props.wallet.logo.src} alt={props.wallet.logo.alt} width={32} height={32} />
    <p className="ml-2">{props.wallet.title}</p>
  </Button>
);
