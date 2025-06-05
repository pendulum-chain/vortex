import { useClipboard } from '../../hooks/useClipboard';

interface CopyButtonProps {
  text: string;
  className?: string;
  inline?: boolean;
  onClick?: () => void;
}

export const CopyButton = (props: CopyButtonProps) => {
  const clipboard = useClipboard();
  const onClick = props.onClick || (() => clipboard.copyToClipboard(props.text));

  return (
    <button className={`break-all btn p-1 m-0 rounded ${props.className || ''}`} type="button" onClick={onClick}>
      {props.text}
    </button>
  );
};
