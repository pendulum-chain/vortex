import { CheckIcon } from '@heroicons/react/20/solid';
import { AssetIconType, useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { OnChainToken, FiatToken } from '../../../constants/tokenConfig';

interface PoolListItemProps<T extends OnChainToken | FiatToken> {
  tokenType: T;
  tokenSymbol: string;
  isSelected?: boolean;
  onSelect: (tokenType: T) => void;
  assetIcon: AssetIconType;
  name?: string;
}

export function PoolListItem<T extends OnChainToken | FiatToken>({
  tokenType,
  tokenSymbol,
  isSelected,
  onSelect,
  assetIcon,
  name,
}: PoolListItemProps<T>) {
  const tokenIcon = useGetAssetIcon(assetIcon);

  return (
    <button
      type="button"
      key={tokenSymbol}
      onClick={() => onSelect(tokenType)}
      className="items-center justify-start w-full gap-4 px-3 py-3 text-left bg-gray-200 border-0 shadow-xs btn hover:opacity-80 hover:bg-gray-300"
    >
      <span className="relative">
        <div className="text-xs">
          <div className="w-10">
            <img src={tokenIcon} alt={tokenSymbol} className="object-contain w-full h-full" />
          </div>
        </div>
        {isSelected && (
          <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-lg leading-5">
          <strong>{tokenSymbol}</strong>
        </span>
        <span className="text-sm leading-5 text-neutral-500">{name || tokenSymbol}</span>
      </span>
    </button>
  );
}
