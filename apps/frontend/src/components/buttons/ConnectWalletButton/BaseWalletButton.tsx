import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { ReactNode } from "react";
import accountBalanceWalletIcon from "../../../assets/account-balance-wallet.svg";
import accountBalanceWalletIconPink from "../../../assets/account-balance-wallet-pink.svg";
import { trimAddress } from "../../../helpers/addressFormatter";
import { WalletButtonVariant } from "./index";
import { getIconStyles, getTextStyles, getWalletButtonStyles } from "./walletButtonStyles";

interface BaseWalletButtonProps {
  variant: WalletButtonVariant;
  customStyles?: string;
  onClick?: () => void;
  children?: ReactNode;
  showPlayIcon?: boolean;
  showWalletIcons?: boolean;
  address?: string;
  hideIcon?: boolean;
}

export const BaseWalletButton = ({
  variant,
  customStyles,
  onClick,
  children,
  showPlayIcon = false,
  showWalletIcons = false,
  address,
  hideIcon = false
}: BaseWalletButtonProps) => {
  const buttonStyles = getWalletButtonStyles(variant, customStyles);
  const iconStyles = getIconStyles(variant);
  const textStyles = getTextStyles(variant);

  return (
    <button className={buttonStyles} onClick={onClick} type="button">
      {showWalletIcons ? (
        <>
          <img alt="wallet account button" className="block group-hover:hidden" src={accountBalanceWalletIcon} />
          <img alt="wallet account button hovered" className="hidden group-hover:block" src={accountBalanceWalletIconPink} />
        </>
      ) : (
        <>
          {children ? (
            children
          ) : (
            <>
              {" "}
              <p className={textStyles}>{address ? trimAddress(address) : ""}</p>{" "}
            </>
          )}
          {!hideIcon && showPlayIcon && <PlayCircleIcon className={iconStyles} />}
        </>
      )}
    </button>
  );
};
