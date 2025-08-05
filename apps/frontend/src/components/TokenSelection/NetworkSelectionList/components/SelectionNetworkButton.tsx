import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Networks } from "@packages/shared";
import ALL_NETWORKS_ICON from "../../../../assets/chains/all-networks.svg";
import { cn } from "../../../../helpers/cn";
import { NetworkIcon } from "../../../NetworkIcon";
import { SelectionButtonMotion, SelectionChevronMotion } from "../animations";

interface SelectionNetworkButtonProps {
  selectedNetworkFilter: Networks | "all";
  isNetworkDropdownOpen: boolean;
  onToggle: () => void;
}

export const SelectionNetworkButton = ({
  selectedNetworkFilter,
  isNetworkDropdownOpen,
  onToggle
}: SelectionNetworkButtonProps) => {
  return (
    <SelectionButtonMotion
      className={cn(
        "flex h-[3rem] min-w-[4rem] cursor-pointer items-center justify-between gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 pr-3 text-sm hover:border-primary hover:bg-gray-50",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      )}
      isExpanded={isNetworkDropdownOpen}
      onClick={onToggle}
    >
      {selectedNetworkFilter !== "all" ? (
        <NetworkIcon className="h-6 w-6" network={selectedNetworkFilter} />
      ) : (
        <img alt="All Networks" className="h-6 w-6" src={ALL_NETWORKS_ICON} />
      )}
      <SelectionChevronMotion isOpen={isNetworkDropdownOpen}>
        <ChevronDownIcon className="h-3 w-3" />
      </SelectionChevronMotion>
    </SelectionButtonMotion>
  );
};
