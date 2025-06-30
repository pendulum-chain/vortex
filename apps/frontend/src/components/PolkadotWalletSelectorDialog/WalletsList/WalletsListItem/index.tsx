import { Wallet } from "@talismn/connect-wallets";

interface WalletsListItemProps {
  wallet: Wallet;
  onClick: (wallet: Wallet) => void;
}

function buttonOnClick(props: WalletsListItemProps) {
  const { wallet, onClick } = props;

  return wallet.installed ? onClick?.(wallet) : window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
}

export const WalletsListItem = (props: WalletsListItemProps) => (
  <button
    className="btn flex w-full justify-center border-0 shadow-xs outline-primary md:justify-start"
    key={props.wallet.extensionName}
    onClick={() => buttonOnClick(props)}
  >
    <img alt={props.wallet.logo.alt} height={32} src={props.wallet.logo.src} width={32} />
    <p className="ml-2">{props.wallet.title}</p>
  </button>
);
