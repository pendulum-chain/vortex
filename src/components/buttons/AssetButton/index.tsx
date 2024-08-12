import { InputTokenType, OutputTokenType } from '../../../constants/tokenConfig';
import { useGetIcon } from '../../../hooks/useGetIcon';

interface AssetButtonProps {
  tokenType?: InputTokenType | OutputTokenType | 'eur';
  tokenSymbol?: string;
  onClick: () => void;
}
export function AssetButton({ tokenType, tokenSymbol, onClick }: AssetButtonProps) {
  const icon = useGetIcon(tokenType);

  return (
    <button
      className="hover:bg-blue-200 rounded-full min-h-none h-8 flex items-center mt-0.5 border border-blue-700 px-2 py-1 pr-3"
      onClick={onClick}
      type="button"
    >
      <span className="h-full p-px mr-1 rounded-full">
        {tokenType && <img src={icon} alt={tokenType} className="w-auto h-full" />}
      </span>
      <strong className="font-bold text-black">{tokenSymbol || 'Select'}</strong>
    </button>
  );
}
