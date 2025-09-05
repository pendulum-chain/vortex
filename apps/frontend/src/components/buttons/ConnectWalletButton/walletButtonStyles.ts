import { cn } from "../../../helpers/cn";
import { WalletButtonVariant } from "./index";

export const getWalletButtonStyles = (variant: WalletButtonVariant, customStyles?: string): string => {
  const baseStyles = "btn group";

  const variantStyles = {
    [WalletButtonVariant.Standard]: "btn-vortex-secondary rounded-3xl",
    [WalletButtonVariant.Minimal]: "h-auto! border-gray-300! text-gray-600!"
  };

  return cn(baseStyles, variantStyles[variant], customStyles);
};

export const getIconStyles = (variant: WalletButtonVariant): string => {
  const baseIconStyles = "w-5 group-hover:text-pink-600";

  const variantIconStyles = {
    [WalletButtonVariant.Standard]: "",
    [WalletButtonVariant.Minimal]: "w-4"
  };

  return cn(baseIconStyles, variantIconStyles[variant]);
};

export const getTextStyles = (variant: WalletButtonVariant): string => {
  const baseTextStyles = "font-thin";

  const variantTextStyles = {
    [WalletButtonVariant.Standard]: "",
    [WalletButtonVariant.Minimal]: ""
  };

  return cn(baseTextStyles, variantTextStyles[variant]);
};
