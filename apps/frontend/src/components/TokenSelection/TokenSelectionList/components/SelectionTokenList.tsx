import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { useNetwork } from "../../../../contexts/network";
import { cn } from "../../../../helpers/cn";
import { useTokenBalances } from "../../../../stores/tokenBalanceStore";
import { useIsNetworkDropdownOpen, useSearchFilter, useSelectedNetworkFilter } from "../../../../stores/tokenSelectionStore";
import { ListItem } from "../../../ListItem";
import { useIsFiatDirection, useTokenDefinitions } from "../helpers";
import { ExtendedTokenDefinition, useTokenSelection } from "../hooks/useTokenSelection";

const ROW_HEIGHT = 56;
const OVERSCAN = 10;
const MIN_ITEMS_FOR_VIRTUALIZATION = 20;

function getBalanceKey(network: string, symbol: string): string {
  return `${network}-${symbol}`;
}

function sortByBalance(
  definitions: ExtendedTokenDefinition[],
  balances: Map<string, { balance: string; balanceUsd: string }>
): ExtendedTokenDefinition[] {
  return [...definitions].sort((a, b) => {
    const balanceA = balances.get(getBalanceKey(a.network, a.assetSymbol));
    const balanceB = balances.get(getBalanceKey(b.network, b.assetSymbol));
    const usdA = parseFloat(balanceA?.balanceUsd ?? "0");
    const usdB = parseFloat(balanceB?.balanceUsd ?? "0");

    if (usdA !== usdB) {
      return usdB - usdA;
    }
    return a.assetSymbol.localeCompare(b.assetSymbol);
  });
}

export const SelectionTokenList = () => {
  const isFiatDirection = useIsFiatDirection();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const searchFilter = useSearchFilter();
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const { selectedNetwork } = useNetwork();
  const { filteredDefinitions } = useTokenDefinitions(searchFilter, selectedNetworkFilter);
  const { handleTokenSelect, selectedToken } = useTokenSelection();

  const balances = useTokenBalances();

  const currentDefinitions = useMemo(
    () => (isFiatDirection ? filteredDefinitions : sortByBalance(filteredDefinitions, balances)),
    [isFiatDirection, filteredDefinitions, balances]
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const shouldVirtualize = currentDefinitions.length > MIN_ITEMS_FOR_VIRTUALIZATION;

  const rowVirtualizer = useVirtualizer({
    count: currentDefinitions.length,
    enabled: shouldVirtualize,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => parentRef.current,
    overscan: OVERSCAN
  });

  return (
    <div
      className={cn(
        "no-scrollbar mt-3 flex-1 overflow-auto border-gray-200 border-t pt-3 pb-10",
        isNetworkDropdownOpen && "pointer-events-none opacity-0"
      )}
      ref={parentRef}
    >
      {shouldVirtualize ? (
        <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map(virtualItem => {
            const token = currentDefinitions[virtualItem.index];
            const isSelected = selectedToken === token.type && selectedNetwork === token.network;
            const tokenBalance = balances.get(getBalanceKey(token.network, token.assetSymbol));

            return (
              <div
                className="absolute left-0 w-full"
                key={virtualItem.key}
                style={{ height: ROW_HEIGHT, transform: `translateY(${virtualItem.start}px)` }}
              >
                <ListItem
                  balance={tokenBalance?.balance}
                  isSelected={isSelected}
                  onSelect={tokenType => handleTokenSelect(tokenType, token)}
                  token={token}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {currentDefinitions.map(token => {
            const isSelected = selectedToken === token.type && selectedNetwork === token.network;
            const tokenBalance = balances.get(getBalanceKey(token.network, token.assetSymbol));
            return (
              <ListItem
                balance={tokenBalance?.balance}
                isSelected={isSelected}
                key={`${token.type}-${token.network}`}
                onSelect={tokenType => handleTokenSelect(tokenType, token)}
                token={token}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
