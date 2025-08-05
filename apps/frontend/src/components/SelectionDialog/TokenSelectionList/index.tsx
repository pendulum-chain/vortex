import { XMarkIcon } from "@heroicons/react/24/outline";
import { FiatToken, FiatTokenDetails, Networks, OnChainToken, OnChainTokenDetails } from "@packages/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isFiatTokenDisabled } from "../../../config/tokenAvailability";
import { useNetwork } from "../../../contexts/network";
import { cn } from "../../../helpers/cn";
import { useFiatToken, useOnChainToken, useRampFormStoreActions } from "../../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useRampModalActions, useRampModalState } from "../../../stores/rampModalStore";
import { RampDirection } from "../../RampToggle";
import { SearchInput } from "../../SearchInput";
import { NetworkDropdown } from "../NetworkSelectionList";
import { PoolListItem } from "../PoolListItem";
import { useTokenDefinitions } from "./helpers";

export interface TokenDefinition {
  assetSymbol: string;
  name?: string;
  assetIcon: string;
  type: OnChainToken | FiatToken;
  details: OnChainTokenDetails | FiatTokenDetails;
}

export interface ExtendedTokenDefinition extends TokenDefinition {
  network: Networks;
  networkDisplayName: string;
}

export function TokenSelectionList() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>("");
  const [selectedNetworkFilter] = useState<Networks | "all">("all");
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const { filteredDefinitions } = useTokenDefinitions(filter, selectedNetworkFilter);
  const { tokenSelectModalType } = useRampModalState();
  const { closeTokenSelectModal } = useRampModalActions();
  const { setSelectedNetwork } = useNetwork();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { setFiatToken, setOnChainToken } = useRampFormStoreActions();
  const rampDirection = useRampDirection();

  const handleTokenSelect = async (token: OnChainToken | FiatToken, tokenDefinition: ExtendedTokenDefinition) => {
    const isFiatToken = Object.values(FiatToken).includes(token as FiatToken);
    if (isFiatToken && isFiatTokenDisabled(token as FiatToken)) {
      return;
    }

    // Switch network immediately for onchain tokens
    if (!isFiatToken) {
      await setSelectedNetwork(tokenDefinition.network);
    }

    if (rampDirection === RampDirection.ONRAMP) {
      if (tokenSelectModalType === "from") {
        setFiatToken(token as FiatToken);
      } else {
        setOnChainToken(token as OnChainToken);
      }
    } else {
      if (tokenSelectModalType === "from") {
        setOnChainToken(token as OnChainToken);
      } else {
        setFiatToken(token as FiatToken);
      }
    }
    closeTokenSelectModal();
  };

  const selectedToken =
    rampDirection === RampDirection.ONRAMP
      ? tokenSelectModalType === "from"
        ? fiatToken
        : onChainToken
      : tokenSelectModalType === "from"
        ? onChainToken
        : fiatToken;

  return (
    <div className="absolute top-0 right-0 bottom-0 left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="font-bold text-3xl">Select a token</h1>
        </div>
        <button className="btn-vortex-accent cursor-pointer rounded-full p-2">
          <XMarkIcon className="h-4 w-4" tabIndex={1} />
        </button>
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-2 transition-all">
        <NetworkDropdown isNetworkDropdownOpen={isNetworkDropdownOpen} setIsNetworkDropdownOpen={setIsNetworkDropdownOpen} />
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isNetworkDropdownOpen ? "w-0 opacity-0" : "flex-grow opacity-100"
          )}
          style={{
            flexBasis: isNetworkDropdownOpen ? "0%" : "auto",
            transitionDelay: isNetworkDropdownOpen ? "0ms" : "250ms"
          }}
        >
          <SearchInput
            className="w-full"
            placeholder={t("components.dialogs.selectionModal.searchPlaceholder")}
            set={setFilter}
          />
        </div>
      </div>
      <div
        className={cn(
          "no-scrollbar mt-3 flex-1 overflow-y-auto border-gray-200 border-t pb-10",
          isNetworkDropdownOpen ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        <div className="mt-3 flex flex-col gap-2 transition-opacity duration-300">
          {filteredDefinitions.map(token => (
            <PoolListItem
              isSelected={selectedToken === token.type}
              key={`${token.type}-${token.network}`}
              onSelect={tokenType => handleTokenSelect(tokenType, token)}
              token={token}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
