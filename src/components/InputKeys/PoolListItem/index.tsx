import { CheckIcon } from '@heroicons/react/20/solid';
import { useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { InputTokenType, isOutputTokenType, OutputTokenType } from '../../../constants/tokenConfig';

import { InputTokenDetails } from '../../../constants/tokenConfig';
import { UserBalance } from '../../UserBalance';
import { TokenDefinition } from '../SelectionModal';

interface PoolListItemProps {
  token: TokenDefinition;
  isSelected?: boolean;
  onSelect: (tokenType: InputTokenType | OutputTokenType) => void;
}

export function PoolListItem({ token, isSelected, onSelect }: PoolListItemProps) {
  const isInputToken = !isOutputTokenType(token.type);

  const tokenIcon = useGetAssetIcon(token.assetIcon);

  return (
    <button
      type="button"
      key={token.assetSymbol}
      onClick={() => onSelect(token.type)}
      className="items-center justify-start w-full gap-4 px-3 py-3 text-left bg-gray-200 border-0 shadow-xs btn hover:opacity-80 hover:bg-gray-300"
    >
      <span className="relative">
        <div className="text-xs">
          <div className="w-10">
            <img src={tokenIcon} alt={token.assetSymbol} className="object-contain w-full h-full" />
          </div>
        </div>
        {isSelected && (
          <CheckIcon className="absolute -right-1 -top-1 w-5 h-5 p-[3px] text-white bg-green-600 rounded-full" />
        )}
      </span>
      <div className="flex justify-between w-full">
        <span className="flex flex-col">
          <span className="text-lg leading-5">
            <strong>{token.assetSymbol}</strong>
          </span>
          <span className="text-sm leading-5 text-neutral-500">{token.name || token.assetSymbol}</span>
        </span>
        <span className="text-base">
          {isInputToken && <UserBalance token={token.details as InputTokenDetails} className="font-bold" />}
        </span>
      </div>
    </button>
  );
}
