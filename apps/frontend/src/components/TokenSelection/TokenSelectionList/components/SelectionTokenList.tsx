import { useVirtualizer } from "@tanstack/react-virtual";
import { FiatToken, OnChainToken } from "@vortexfi/shared";
import { useRef } from "react";
import { useNetwork } from "../../../../contexts/network";
import { cn } from "../../../../helpers/cn";
import { useTokensSortedByBalance } from "../../../../hooks/useTokensSortedByBalance";
import { useIsNetworkDropdownOpen, useSearchFilter, useSelectedNetworkFilter } from "../../../../stores/tokenSelectionStore";
import { ListItem } from "../../../ListItem";
import { useIsFiatDirection, useTokenDefinitions } from "../helpers";
import { ExtendedTokenDefinition, useTokenSelection } from "../hooks/useTokenSelection";

const ROW_HEIGHT = 56;

export const SelectionTokenList = () => {
  const isFiatDirection = useIsFiatDirection();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const searchFilter = useSearchFilter();
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const { selectedNetwork } = useNetwork();
  const { filteredDefinitions } = useTokenDefinitions(searchFilter, selectedNetworkFilter);

  const sortedDefinitions = useTokensSortedByBalance(filteredDefinitions);
  const currentDefinitions = isFiatDirection ? filteredDefinitions : sortedDefinitions;
  const { handleTokenSelect, selectedToken } = useTokenSelection();

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: currentDefinitions.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => parentRef.current
  });

  const handleSelect = (tokenType: OnChainToken | FiatToken, token: ExtendedTokenDefinition) => {
    handleTokenSelect(tokenType, token);
  };

  return (
    <div
      className={cn(
        "no-scrollbar mt-3 flex-1 overflow-auto border-gray-200 border-t pt-3 pb-10",
        isNetworkDropdownOpen ? "pointer-events-none opacity-0" : "opacity-100"
      )}
      ref={parentRef}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%"
        }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const token = currentDefinitions[virtualItem.index];
          const isSelected = selectedToken === token.type && selectedNetwork === token.network;

          return (
            <div
              key={virtualItem.key}
              style={{
                height: `${virtualItem.size}px`,
                left: 0,
                position: "absolute",
                top: 0,
                transform: `translateY(${virtualItem.start}px)`,
                width: "100%"
              }}
            >
              <ListItem isSelected={isSelected} onSelect={tokenType => handleSelect(tokenType, token)} token={token} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
