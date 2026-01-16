import { FiatToken, OnChainToken } from "@vortexfi/shared";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { List as WindowedList } from "react-window";
import { useNetwork } from "../../../../contexts/network";
import { cn } from "../../../../helpers/cn";
import { useTokensSortedByBalance } from "../../../../hooks/useTokensSortedByBalance";
import { useIsNetworkDropdownOpen, useSearchFilter, useSelectedNetworkFilter } from "../../../../stores/tokenSelectionStore";
import { ListItem } from "../../../ListItem";
import { useIsFiatDirection, useTokenDefinitions } from "../helpers";
import { ExtendedTokenDefinition, useTokenSelection } from "../hooks/useTokenSelection";

interface SelectionListData {
  tokens: ExtendedTokenDefinition[];
  selectedToken: any;
  selectedNetwork: any;
  handleTokenSelect: (type: OnChainToken | FiatToken, token: ExtendedTokenDefinition) => void;
}

type RowComponentProps = SelectionListData & {
  index: number;
  style: CSSProperties;
};

const RowComponent = ({ index, style, tokens, selectedToken, selectedNetwork, handleTokenSelect }: RowComponentProps) => {
  //
  const token = tokens[index];
  const isSelected = selectedToken === token.type && selectedNetwork === token.network;

  return (
    <div style={style}>
      <div className="pb-2">
        <ListItem isSelected={isSelected} onSelect={tokenType => handleTokenSelect(tokenType, token)} token={token} />
      </div>
    </div>
  );
};
export const SelectionTokenList = () => {
  const isFiatDirection = useIsFiatDirection();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const searchFilter = useSearchFilter();
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const { selectedNetwork } = useNetwork();
  const { filteredDefinitions } = useTokenDefinitions(searchFilter, selectedNetworkFilter);

  //const sortedDefinitions = useTokensSortedByBalance(filteredDefinitions);
  const currentDefinitions = isFiatDirection ? filteredDefinitions : filteredDefinitions;
  const { handleTokenSelect, selectedToken } = useTokenSelection();

  const parentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 });

  useEffect(() => {
    if (!parentRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          height: entry.contentRect.height,
          width: entry.contentRect.width
        });
      }
    });

    resizeObserver.observe(parentRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "no-scrollbar mt-3 flex-1 overflow-hidden border-gray-200 border-t pb-10",
        isNetworkDropdownOpen ? "pointer-events-none opacity-0" : "opacity-100"
      )}
      ref={parentRef}
    >
      {}
      {dimensions.height > 0 && (
        <WindowedList
          rowComponent={RowComponent}
          rowCount={currentDefinitions.length}
          rowHeight={80}
          rowProps={{
            handleTokenSelect,
            selectedNetwork,
            selectedToken,
            tokens: currentDefinitions
          }}
          // TODO fix types
          style={{ height: dimensions.height, width: dimensions.width }}
        />
      )}
    </div>
  );
};
