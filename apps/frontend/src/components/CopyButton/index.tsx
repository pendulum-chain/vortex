import { ToastMessage, useToastMessage } from "../../helpers/notifications";
import { useClipboard } from "../../hooks/useClipboard";

interface CopyButtonProps {
  text: string;
  className?: string;
  inline?: boolean;
  onClick?: () => void;
}

export const CopyButton = (props: CopyButtonProps) => {
  const clipboard = useClipboard();
  const { showToast } = useToastMessage();
  const onClick =
    props.onClick ||
    (() => {
      clipboard.copyToClipboard(props.text);
      showToast(ToastMessage.COPY_TEXT);
    });

  return (
    <button
      className={`btn m-0 inline-flex items-center break-all rounded bg-gray-50 p-1 hover:bg-gray-100 ${props.className}`}
      onClick={onClick}
      type="button"
    >
      {props.text}
    </button>
  );
};
