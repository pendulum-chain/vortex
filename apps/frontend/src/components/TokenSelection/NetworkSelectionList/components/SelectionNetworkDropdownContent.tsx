import { getNetworkDisplayName, Networks } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import ALL_NETWORKS_ICON from "../../../../assets/chains/all-networks.svg";
import { useIsNetworkDropdownOpen, useSearchFilter, useSelectedNetworkFilter } from "../../../../stores/tokenSelectionStore";
import { NetworkIcon } from "../../../NetworkIcon";
import { useTokenDefinitions } from "../../TokenSelectionList/helpers";
import { SelectionDropdownMotion } from "../animations";

interface SelectionNetworkDropdownContentProps {
  onNetworkSelect: (network: Networks | "all") => void;
}

export const SelectionNetworkDropdownContent = ({ onNetworkSelect }: SelectionNetworkDropdownContentProps) => {
  const selectedNetworkFilter = useSelectedNetworkFilter();
  const isOpen = useIsNetworkDropdownOpen();
  const searchFilter = useSearchFilter();
  const { availableNetworks } = useTokenDefinitions(searchFilter, selectedNetworkFilter);
  const { t } = useTranslation();

  return (
    <SelectionDropdownMotion
      className="absolute top-[3.1rem] left-0 z-50 w-full overflow-hidden rounded-lg bg-white shadow-lg"
      isOpen={isOpen}
    >
      <div className="no-scrollbar w-full overflow-scroll p-4">
        <div className="relative grid grid-cols-1 gap-2">
          <button
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-100"
            onClick={() => onNetworkSelect("all")}
          >
            <img alt="All Networks" className="h-6 w-6" src={ALL_NETWORKS_ICON} />
            <span>{t("components.dialogs.selectionModal.allNetworks", "All Networks")}</span>
          </button>
          <ul className="flex flex-col gap-2">
            {availableNetworks.map(network => (
              <li className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-100" key={network}>
                <button
                  className="flex w-full cursor-pointer items-center gap-2"
                  key={network}
                  onClick={() => onNetworkSelect(network)}
                >
                  <NetworkIcon className="h-6 w-6" network={network} />
                  <span>{getNetworkDisplayName(network)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SelectionDropdownMotion>
  );
};
