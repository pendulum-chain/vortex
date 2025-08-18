import { useNetwork } from "../../../../contexts/network";
import { cn } from "../../../../helpers/cn";
import { useTokensSortedByBalance } from "../../../../hooks/useTokensSortedByBalance";
import { useIsNetworkDropdownOpen, useSearchFilter, useSelectedNetworkFilter } from "../../../../stores/tokenSelectionStore";
import { ListItem } from "../../../ListItem";
import { useTokenDefinitions } from "../helpers";
import { useTokenSelection } from "../hooks/useTokenSelection";

export const SelectionTokenList = () => {
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const searchFilter = useSearchFilter();
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const { selectedNetwork } = useNetwork();
  const { filteredDefinitions } = useTokenDefinitions(searchFilter, selectedNetworkFilter);
  const sortedDefinitions = useTokensSortedByBalance(filteredDefinitions);

  const { handleTokenSelect, selectedToken } = useTokenSelection();

  return (
    <div
      className={cn(
        "no-scrollbar mt-3 flex-1 overflow-y-auto border-gray-200 border-t pb-10",
        isNetworkDropdownOpen ? "pointer-events-none opacity-0" : "opacity-100"
      )}
    >
      <ul className="mt-3 flex flex-col gap-2 transition-opacity duration-150">
        {sortedDefinitions.map(token => (
          <li key={`${token.type}-${token.network}`}>
            <ListItem
              isSelected={selectedToken === token.type && selectedNetwork === token.network}
              onSelect={tokenType => handleTokenSelect(tokenType, token)}
              token={token}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
