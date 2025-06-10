import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { cn } from '../../../helpers/cn';
import { useGetAssetIcon } from '../../../hooks/useGetAssetIcon';

interface AssetButtonProps {
  assetIcon: string;
  tokenSymbol: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AssetButton({ assetIcon, tokenSymbol, onClick, disabled }: AssetButtonProps) {
  const icon = useGetAssetIcon(assetIcon);

  return (
    <button
      className={cn(
        ' cursor-pointer rounded-full h-8 flex text-base items-center mt-0.5 border border-blue-700 px-2 py-1 pr-3',
        disabled ? 'cursor-not-allowed' : 'hover:bg-blue-200',
      )}
      onClick={onClick}
      type="button"
      disabled={disabled}
    >
      <span className="h-full p-px mr-1 rounded-full">
        <img src={icon} alt={assetIcon} className="h-full min-h-5 max-w-min" />
      </span>
      <strong className="font-bold text-black">{tokenSymbol}</strong>
      <ChevronDownIcon className="w-6" />
    </button>
  );
}
