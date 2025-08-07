import { CheckIcon } from "@heroicons/react/20/solid";
import { FiatToken, isFiatToken, isOnChainToken, OnChainToken, OnChainTokenDetails } from "@packages/shared";
import { useTranslation } from "react-i18next";
import { getTokenDisabledReason, isFiatTokenDisabled } from "../../config/tokenAvailability";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { ExtendedTokenDefinition } from "../TokenSelection/TokenSelectionList/hooks/useTokenSelection";
import { UserBalance } from "../UserBalance";

interface ListItemProps {
  isSelected?: boolean;
  onSelect: (tokenType: OnChainToken | FiatToken) => void;
  token: ExtendedTokenDefinition;
}

export function ListItem({ token, isSelected, onSelect }: ListItemProps) {
  const { t } = useTranslation();
  const tokenIcon = useGetAssetIcon(token.assetIcon);

  const showBalance = isOnChainToken(token.type);

  const isDisabled = isFiatToken(token.type) && isFiatTokenDisabled(token.type);
  const disabledReason = isFiatToken(token.type) && isDisabled ? t(getTokenDisabledReason(token.type)) : undefined;

  return (
    <button
      className={`btn w-full justify-start gap-4 rounded-lg border-gray-200 px-3 text-left hover:bg-gray-100 ${
        isDisabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      key={token.assetSymbol}
      onClick={() => !isDisabled && onSelect(token.type)}
      type="button"
    >
      <span className="relative">
        <div className="text-xs">
          <div className="w-10">
            <img alt={token.assetSymbol} className="h-full w-full object-contain" src={tokenIcon} />
          </div>
        </div>
        {isSelected && <CheckIcon className="-right-1 -top-1 absolute h-5 w-5 rounded-full bg-green-600 p-[3px] text-white" />}
      </span>
      <div className="flex w-full justify-between">
        <span className="flex flex-col">
          <span className="text-lg leading-5">
            <strong>{token.assetSymbol}</strong>
          </span>
          <span className="text-neutral-500 text-sm leading-5">
            {isDisabled ? (
              <span className="text-red-500">{disabledReason || "Unavailable"}</span>
            ) : (
              <>
                {token.name && <div>{token.name}</div>}
                <div>({token.networkDisplayName})</div>
              </>
            )}
          </span>
        </span>
        <span className="text-base">
          {showBalance && <UserBalance className="font-bold" token={token.details as OnChainTokenDetails} />}
        </span>
      </div>
    </button>
  );
}
