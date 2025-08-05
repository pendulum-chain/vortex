import { Networks } from "@packages/shared";
import {
  useIsNetworkDropdownOpen,
  useSearchFilter,
  useSelectedNetworkFilter,
  useSetSelectedNetworkFilter,
  useToggleNetworkDropdown
} from "../../../stores/tokenSelectionStore";
import { useTokenDefinitions } from "../TokenSelectionList/helpers";
import { SelectionNetworkButton } from "./components/SelectionNetworkButton";
import { SelectionNetworkDropdownContent } from "./components/SelectionNetworkDropdownContent";

export const NetworkDropdown = () => {
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const searchFilter = useSearchFilter();
  const setSelectedNetworkFilter = useSetSelectedNetworkFilter();
  const toggleNetworkDropdown = useToggleNetworkDropdown();
  const { availableNetworks } = useTokenDefinitions(searchFilter, selectedNetworkFilter);

  const handleNetworkSelect = (network: Networks | "all") => {
    setSelectedNetworkFilter(network);
  };

  return (
    <>
      <SelectionNetworkButton
        isNetworkDropdownOpen={isNetworkDropdownOpen}
        onToggle={toggleNetworkDropdown}
        selectedNetworkFilter={selectedNetworkFilter}
      />
      <SelectionNetworkDropdownContent
        availableNetworks={availableNetworks}
        isOpen={isNetworkDropdownOpen}
        onNetworkSelect={handleNetworkSelect}
      />
    </>
  );
};
