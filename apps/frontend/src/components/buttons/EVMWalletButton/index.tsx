import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import accountBalanceWalletIcon from "../../../assets/account-balance-wallet.svg";
import accountBalanceWalletIconPink from "../../../assets/account-balance-wallet-pink.svg";
import { trimAddress } from "../../../helpers/addressFormatter";
import { cn } from "../../../helpers/cn";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { wagmiConfig } from "../../../wagmiConfig";

const WalletButton = ({
  onClick,
  children,
  customStyles,
  hideIcon = false,
  showPlayIcon = false,
  showWalletIcons = false,
  address
}: {
  onClick: () => void;
  children?: ReactNode;
  customStyles?: string;
  hideIcon?: boolean;
  showPlayIcon?: boolean;
  showWalletIcons?: boolean;
  address?: string;
}) => (
  <button className={cn(customStyles || "btn-vortex-secondary", "btn group rounded-3xl")} onClick={onClick} type="button">
    {showWalletIcons ? (
      <>
        <img alt="wallet account button" className="block group-hover:hidden" src={accountBalanceWalletIcon} />
        <img alt="wallet account button hovered" className="hidden group-hover:block" src={accountBalanceWalletIconPink} />
        <p className="hidden font-thin md:block ">{address ? trimAddress(address) : ""}</p>
      </>
    ) : (
      <>
        {children}
        {!hideIcon && showPlayIcon && <PlayCircleIcon className="w-5 group-hover:text-pink-600" />}
      </>
    )}
  </button>
);

export function EVMWalletButton({ customStyles, hideIcon }: { customStyles?: string; hideIcon?: boolean }) {
  const { address, chainId: walletChainId } = useVortexAccount();
  const { isConnected } = useAppKitAccount();
  const { caipNetwork: appkitNetwork, switchNetwork } = useAppKitNetwork();
  const { open } = useAppKit();
  const { t } = useTranslation();
  const isOnSupportedNetwork = wagmiConfig.chains.find(chain => chain.id === walletChainId) !== undefined;

  if (!isConnected) {
    return (
      <WalletButton
        customStyles={customStyles}
        hideIcon={hideIcon}
        onClick={() => {
          open({ view: "Connect" });
        }}
        showPlayIcon
      >
        <p className="flex">
          {t("components.dialogs.connectWallet.connect")} <span className="hidden lg:ml-1 lg:block">Wallet</span>
        </p>
      </WalletButton>
    );
  }

  if (!isOnSupportedNetwork) {
    return (
      <WalletButton
        hideIcon={hideIcon}
        onClick={() => {
          if (appkitNetwork) {
            switchNetwork(appkitNetwork);
          }
        }}
        showPlayIcon
      >
        {t("components.dialogs.connectWallet.wrongNetwork")}
      </WalletButton>
    );
  }

  return (
    <WalletButton
      address={address}
      onClick={() => {
        open({ view: "Account" });
      }}
      showWalletIcons
    />
  );
}
