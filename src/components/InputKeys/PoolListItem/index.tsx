import { Button } from 'react-daisyui';
import { CheckIcon } from '@heroicons/react/20/solid';
import { AssetIconType, useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { InputTokenType, OutputTokenType } from '../../../constants/tokenConfig';

interface PoolListItemProps<T extends InputTokenType | OutputTokenType> {
  tokenType: T;
  tokenSymbol: string;
  isSelected?: boolean;
  onSelect: (tokenType: T) => void;
  assetIcon: AssetIconType;
  name?: string;
}

export function PoolListItem<T extends InputTokenType | OutputTokenType>({
  tokenType,
  tokenSymbol,
  isSelected,
  onSelect,
  assetIcon,
  name,
}: PoolListItemProps<T>) {
  const tokenIcon = useGetAssetIcon(assetIcon);

  return (
    <Button
      type="button"
      size="md"
      color="secondary"
      key={tokenSymbol}
      onClick={() => onSelect(tokenType)}
      className="items-center justify-start w-full h-auto gap-4 px-3 py-2 text-left border-0 bg-blackAlpha-200 hover:opacity-80 dark:bg-whiteAlpha-200"
    >
      <span className="relative">
        <div className="text-xs ">
          <div className="w-10">
            <img src={tokenIcon} alt={tokenSymbol} className="object-contain w-full h-full" />
          </div>
        </div>
        {isSelected && (
          <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-lg leading-5 dark:text-white">
          <strong>{tokenSymbol}</strong>
        </span>
        <span className="text-sm leading-5 text-neutral-500">{name || tokenSymbol}</span>
      </span>
    </Button>
  );
}
