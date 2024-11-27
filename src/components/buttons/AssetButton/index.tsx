import { AssetIconType, useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

interface AssetButtonProps {
  assetIcon: AssetIconType;
  tokenSymbol: string;
  onClick: () => void;
}

export function AssetButton({ assetIcon, tokenSymbol, onClick }: AssetButtonProps) {
  const icon = useGetAssetIcon(assetIcon);

  return (
    <button
      className="hover:bg-blue-200 rounded-full min-h-none h-8 flex items-center mt-0.5 border border-blue-700 px-2 py-1 pr-3"
      onClick={onClick}
      type="button"
    >
      <span className="h-full p-px mr-1 rounded-full">
        <img src={icon} alt={assetIcon} className="w-auto h-full" />
      </span>
      <strong className="font-bold text-black">{tokenSymbol}</strong>
      <ChevronDownIcon className="w-6" />
    </button>
  );
}
