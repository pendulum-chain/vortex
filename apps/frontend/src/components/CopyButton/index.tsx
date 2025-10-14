import { useState } from "react";
import { ToastMessage, useToastMessage } from "../../helpers/notifications";
import { useClipboard } from "../../hooks/useClipboard";
import { CopyButtonIcon } from "./CopyButtonIcon";

interface CopyButtonProps {
  text: string;
  className?: string;
  noBorder?: boolean;
  iconPosition?: "left" | "right";
  onClick?: () => void;
}

const getButtonClasses = (noBorder: boolean, className: string) => {
  const baseClasses = "btn m-0 inline-flex items-center break-all rounded p-1 transition-colors";
  const borderClasses = noBorder
    ? "border-none bg-transparent hover:bg-gray-100"
    : "border-gray-200 bg-gray-50 hover:bg-gray-100";

  return `${baseClasses} ${borderClasses} ${className}`;
};

const getIconClasses = (iconPosition: "left" | "right") => {
  return `h-4 w-4 ${iconPosition === "left" ? "mr-1" : "ml-1"}`;
};

export const CopyButton = ({ text, className = "", noBorder = false, iconPosition = "left", onClick }: CopyButtonProps) => {
  const clipboard = useClipboard();
  const { showToast } = useToastMessage();
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    clipboard.copyToClipboard(text);
    showToast(ToastMessage.COPY_TEXT);
    setCopied(true);
    onClick?.();
  };

  const handleAnimationComplete = () => {
    setCopied(false);
  };

  const buttonClasses = getButtonClasses(noBorder, className);
  const iconClasses = getIconClasses(iconPosition);

  return (
    <button className={buttonClasses} onClick={handleClick} type="button">
      {iconPosition === "left" && (
        <CopyButtonIcon className={iconClasses} copied={copied} onAnimationComplete={handleAnimationComplete} />
      )}
      {text}
      {iconPosition === "right" && (
        <CopyButtonIcon className={iconClasses} copied={copied} onAnimationComplete={handleAnimationComplete} />
      )}
    </button>
  );
};
