import { CopyIcon } from "../../../assets/CopyIcon";
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

  return <ClickablePublicKey {...{ ...props, publicKey }} icon={<CopyIcon />} onClick={handleClick} />;
};
