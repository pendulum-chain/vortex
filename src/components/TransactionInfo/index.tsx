import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { useClipboard } from '../../hooks/useClipboard';

export const TransactionInfo = ({ transactionId }: { transactionId: string }) => {
  const clipboard = useClipboard();

  return (
    <div className="flex items-center justify-center">
      <p className="text-sm text-gray-400">Transaction ID: {transactionId}</p>
      <button
        onClick={() => clipboard.copyToClipboard(transactionId)}
        type="button"
        className="flex items-center justify-center w-5 h-5 ml-1 transition border border-gray-400 rounded-full cursor-pointer click-animation hover:scale-105 hover:border-black hover:text-black"
      >
        <ClipboardDocumentIcon className="w-4" />
      </button>
    </div>
  );
};
