import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { ReactNode } from "react";
import { cn } from "../../../helpers/cn";

import { useTranslation } from "react-i18next";
import accountBalanceWalletIconPink from "../../../assets/account-balance-wallet-pink.svg";
import accountBalanceWalletIcon from "../../../assets/account-balance-wallet.svg";
import { trimAddress } from "../../../helpers/addressFormatter";
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
  <button onClick={onClick} type="button" className={cn(customStyles || "btn-vortex-secondary", "btn group rounded-3xl")}>
    {showWalletIcons ? (
      <>
        <img src={accountBalanceWalletIcon} className="block group-hover:hidden" alt="wallet account button" />
        <img src={accountBalanceWalletIconPink} className="hidden group-hover:block" alt="wallet account button hovered" />
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
        onClick={() => {
          open({ view: "Connect" });
        }}
        customStyles={customStyles}
        hideIcon={hideIcon}
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
        onClick={() => {
          if (appkitNetwork) {
            switchNetwork(appkitNetwork);
          }
        }}
        hideIcon={hideIcon}
        showPlayIcon
      >
        {t("components.dialogs.connectWallet.wrongNetwork")}
      </WalletButton>
    );
  }

  return (
    <WalletButton
      onClick={() => {
        open({ view: "Account" });
      }}
      showWalletIcons
      address={address}
    />
  );
}
