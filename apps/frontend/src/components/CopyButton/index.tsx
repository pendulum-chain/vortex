import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToastMessage, useToastMessage } from "../../helpers/notifications";
import { useClipboard } from "../../hooks/useClipboard";
import { AnimatedIcon } from "../AnimatedIcon";

interface CopyButtonProps {
  text: string;
  className?: string;
  noBorder?: boolean;
  iconPosition?: "left" | "right";
  onClick?: () => void;
}

const getButtonClasses = (noBorder: boolean, className: string) => {
  const baseClasses = "btn m-0 inline-flex items-center break-all rounded transition-colors";
  const borderClasses = noBorder
    ? "border-none bg-transparent hover:bg-gray-100"
    : "border-gray-200 bg-gray-50 hover:bg-gray-100";

  return `${baseClasses} ${borderClasses} ${className}`;
};

const getIconClasses = (iconPosition: "left" | "right") => {
  return `h-4 w-4 ${iconPosition === "left" ? "mr-1" : "ml-1"}`;
};

export const CopyButton = ({ text, className = "", noBorder = false, iconPosition = "left", onClick }: CopyButtonProps) => {
  const { t } = useTranslation();
  const clipboard = useClipboard();
  const { showToast } = useToastMessage();
  const [triggerAnimation, setTriggerAnimation] = useState(false);

  const handleClick = () => {
    clipboard.copyToClipboard(text);
    showToast(ToastMessage.COPY_TEXT);
    setTriggerAnimation(true);
    onClick?.();
  };

  const handleAnimationComplete = () => {
    setTriggerAnimation(false);
  };

  const buttonClasses = getButtonClasses(noBorder, className);
  const iconClasses = getIconClasses(iconPosition);

  return (
    <button aria-label={t("components.copyButton.ariaLabel")} className={buttonClasses} onClick={handleClick} type="button">
      {iconPosition === "left" && (
        <AnimatedIcon className={iconClasses} onAnimationComplete={handleAnimationComplete} trigger={triggerAnimation} />
      )}
      {text}
      {iconPosition === "right" && (
        <AnimatedIcon className={iconClasses} onAnimationComplete={handleAnimationComplete} trigger={triggerAnimation} />
      )}
    </button>
  );
};
