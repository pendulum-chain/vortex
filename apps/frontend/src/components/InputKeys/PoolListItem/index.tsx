import { CheckIcon } from '@heroicons/react/20/solid';
import { FiatToken, OnChainToken, OnChainTokenDetails, isFiatToken, isOnChainToken } from '@packages/shared';
import { useTranslation } from 'react-i18next';
import { getTokenDisabledReason, isFiatTokenDisabled } from '../../../config/tokenAvailability';
import { useGetAssetIcon } from '../../../hooks/useGetAssetIcon';
import { UserBalance } from '../../UserBalance';
import { TokenDefinition } from '../SelectionModal';
interface PoolListItemProps {
  isSelected?: boolean;
  onSelect: (tokenType: OnChainToken | FiatToken) => void;
  token: TokenDefinition;
}

export function PoolListItem({ token, isSelected, onSelect }: PoolListItemProps) {
  const { t } = useTranslation();
  const tokenIcon = useGetAssetIcon(token.assetIcon);

  const showBalance = isOnChainToken(token.type);

  const isDisabled = isFiatToken(token.type) && isFiatTokenDisabled(token.type);
  const disabledReason = isFiatToken(token.type) && isDisabled ? t(getTokenDisabledReason(token.type)) : undefined;

  return (
    <button
      type="button"
      key={token.assetSymbol}
      onClick={() => !isDisabled && onSelect(token.type)}
      className={`items-center justify-start w-full gap-4 px-3 py-3 text-left bg-gray-200 border-0 shadow-xs btn ${
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 hover:bg-gray-300'
      }`}
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
          <span className="text-sm leading-5 text-neutral-500">
            {isDisabled ? (
              <span className="text-red-500">{disabledReason || 'Unavailable'}</span>
            ) : (
              token.name || token.assetSymbol
            )}
          </span>
        </span>
        <span className="text-base">
          {showBalance && <UserBalance token={token.details as OnChainTokenDetails} className="font-bold" />}
        </span>
      </div>
    </button>
  );
}
