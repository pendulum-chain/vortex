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
      className={`btn m-0 break-all rounded p-1 inline-flex items-center ${props.className || ""}`}
      onClick={onClick}
      type="button"
    >
      <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-4 0a2 2 0 00-4 0v2a2 2 0 004 0V5z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
      </svg>
      {props.text}
    </button>
  );
};
