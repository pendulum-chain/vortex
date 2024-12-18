import { ClickablePublicKey, ClickablePublicKeyProps } from '../ClickablePublicKey';
import { useClipboard } from '../../../hooks/useClipboard';
import CopyIcon from '../../../assets/copy-icon.svg';

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
      onClick={handleClick}
      icon={<img src={CopyIcon} className="w-4 h-4" alt="Copy" />}
    />
  );
};
