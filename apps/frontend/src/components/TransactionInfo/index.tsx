import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useClipboard } from "../../hooks/useClipboard";

export const TransactionInfo = ({ transactionId }: { transactionId: string }) => {
  const clipboard = useClipboard();

  return (
    <div className="flex items-center justify-center">
      <p className="text-gray-600 text-sm">{transactionId}</p>
      <button
        className="ml-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-gray-400 transition hover:scale-105 hover:border-black hover:text-black focus:scale-105"
        onClick={() => clipboard.copyToClipboard(transactionId)}
        type="button"
      >
        <ClipboardDocumentIcon className="w-4" />
      </button>
    </div>
  );
};
