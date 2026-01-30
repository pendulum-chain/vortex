import { CheckIcon } from "@heroicons/react/20/solid";
import { FiatToken, isFiatToken, OnChainToken, OnChainTokenDetails } from "@vortexfi/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { getTokenDisabledReason, isFiatTokenDisabled } from "../../config/tokenAvailability";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { TokenIconWithNetwork } from "../TokenIconWithNetwork";
import { ExtendedTokenDefinition } from "../TokenSelection/TokenSelectionList/hooks/useTokenSelection";
import { UserBalance } from "../UserBalance";

interface ListItemProps {
  isSelected?: boolean;
  onSelect: (tokenType: OnChainToken | FiatToken) => void;
  token: ExtendedTokenDefinition;
}

export const ListItem = memo(function ListItem({ token, isSelected, onSelect }: ListItemProps) {
  const { t } = useTranslation();
  const fiatIcon = useGetAssetIcon(token.assetIcon);
  const tokenIcon = token.logoURI ?? fiatIcon;
  const isFiat = isFiatToken(token.type);

  const isDisabled = isFiat && isFiatTokenDisabled(token.type as FiatToken);
  const disabledReason = isFiat && isDisabled ? t(getTokenDisabledReason(token.type as FiatToken)) : undefined;

  return (
    <button
      className={`btn w-full justify-start gap-4 rounded-lg border-gray-200 px-3 text-left transition-transform hover:bg-gray-100 active:scale-[0.98] ${
        isDisabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      key={token.assetSymbol}
      onClick={() => !isDisabled && onSelect(token.type)}
      type="button"
    >
      <span className="relative">
        <div className="text-xs">
          <TokenIconWithNetwork
            className="w-10"
            fallbackIconSrc={token.fallbackLogoURI}
            iconSrc={tokenIcon}
            network={isFiat ? undefined : token.network}
            tokenSymbol={token.assetSymbol}
          />
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
              <span className="text-red-800">{disabledReason || "Unavailable"}</span>
            ) : (
              <>
                {token.name && <div>{token.name}</div>}
                {!isFiat && <div>({token.networkDisplayName})</div>}
              </>
            )}
          </span>
        </span>
        <span className="text-base">
          {!isFiat && <UserBalance className="font-bold" token={token.details as OnChainTokenDetails} />}
        </span>
      </div>
    </button>
  );
});
