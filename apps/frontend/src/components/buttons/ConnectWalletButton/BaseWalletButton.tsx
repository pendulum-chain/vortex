import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { ReactNode } from "react";
import { trimAddress } from "../../../helpers/addressFormatter";
import { WalletButtonVariant } from "./index";
import { getIconStyles, getTextStyles, getWalletButtonStyles } from "./walletButtonStyles";

interface BaseWalletButtonProps {
  variant: WalletButtonVariant;
  customStyles?: string;
  onClick?: () => void;
  children?: ReactNode;
  showPlayIcon?: boolean;
  address?: string;
  hideIcon?: boolean;
}

export const BaseWalletButton = ({
  variant,
  customStyles,
  onClick,
  children,
  showPlayIcon = false,
  address,
  hideIcon = false
}: BaseWalletButtonProps) => {
  console.log("DEBUG: customStyles", customStyles);
  const buttonStyles = getWalletButtonStyles(variant, customStyles);
  console.log("DEBUG: buttonStyles", buttonStyles);
  const iconStyles = getIconStyles(variant);
  const textStyles = getTextStyles(variant);

  return (
    <button className={buttonStyles} onClick={onClick} type="button">
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
    </button>
  );
};
