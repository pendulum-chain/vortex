import CopyIcon from "../../../assets/copy-icon.svg";
import { useClipboard } from "../../../hooks/useClipboard";
import { ClickablePublicKey, ClickablePublicKeyProps } from "../ClickablePublicKey";

interface CopyablePublicKeyProps extends ClickablePublicKeyProps {
  onClick?: () => void;
  publicKey: string;
}

export const CopyablePublicKey = ({ onClick, publicKey, ...props }: CopyablePublicKeyProps) => {
  const clipboard = useClipboard();

  const handleClick = () => {
    onClick && onClick();
    clipboard.copyToClipboard(publicKey);
  };

  return (
    <ClickablePublicKey
      {...{ ...props, publicKey }}
      icon={<img alt="Copy" className="h-4 w-4" src={CopyIcon} />}
      onClick={handleClick}
    />
  );
};
