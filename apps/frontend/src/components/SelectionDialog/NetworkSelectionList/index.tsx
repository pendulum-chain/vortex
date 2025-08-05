import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { getNetworkDisplayName, Networks } from "@packages/shared";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ALL_NETWORKS_ICON from "../../../assets/chains/all-networks.svg";
import { cn } from "../../../helpers/cn";
import { NetworkIcon } from "../../NetworkIcon";
import { useTokenDefinitions } from "../TokenSelectionList/helpers";

interface NetworkDropdownProps {
  isNetworkDropdownOpen: boolean;
  setIsNetworkDropdownOpen: (value: boolean) => void;
}

export const NetworkDropdown = ({ isNetworkDropdownOpen, setIsNetworkDropdownOpen }: NetworkDropdownProps) => {
  const { t } = useTranslation();
  const [filter] = useState<string>("");
  const [selectedNetworkFilter, setSelectedNetworkFilter] = useState<Networks | "all">("all");
  const { availableNetworks } = useTokenDefinitions(filter, selectedNetworkFilter);

  return (
    <AnimatePresence>
      <motion.button
        animate={{
          width: isNetworkDropdownOpen ? "100%" : "auto"
        }}
        className={cn(
          "flex h-[3rem] min-w-[4rem] cursor-pointer items-center justify-between gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 pr-3 text-sm hover:border-primary hover:bg-gray-50",
          "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        )}
        onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
        transition={{
          delay: isNetworkDropdownOpen ? 0 : 0.25,
          duration: 0.25
        }}
        whileHover={{ scale: 1.01 }}
      >
        {selectedNetworkFilter !== "all" ? (
          <NetworkIcon className="h-6 w-6" network={selectedNetworkFilter as Networks} />
        ) : (
          <img alt="All Networks" className="h-6 w-6" src={ALL_NETWORKS_ICON} />
        )}
        <motion.div animate={{ rotate: isNetworkDropdownOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDownIcon className="h-3 w-3" />
        </motion.div>
      </motion.button>

      {isNetworkDropdownOpen && (
        <motion.div
          animate={{
            opacity: 1,
            transition: {
              damping: 50,
              delay: 0.25,
              duration: 0.5,
              stiffness: 600,
              type: "spring"
            }
          }}
          className="absolute top-[3.1rem] left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white shadow-lg"
          exit={{
            opacity: 0,
            transition: {
              damping: 50,
              delay: 0,
              duration: 0.3,
              stiffness: 600,
              type: "spring"
            }
          }}
          initial={{ opacity: 0 }}
          key="network-dropdown"
        >
          <div className="w-full overflow-scroll p-4">
            <div className="relative grid grid-cols-1 gap-2">
              <button
                className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-100"
                onClick={() => {
                  setSelectedNetworkFilter("all");
                  setIsNetworkDropdownOpen(false);
                }}
              >
                <img alt="All Networks" className="h-6 w-6" src={ALL_NETWORKS_ICON} />
                <span>{t("components.dialogs.selectionModal.allNetworks", "All Networks")}</span>
              </button>
              {availableNetworks.map(network => (
                <button
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-100"
                  key={network}
                  onClick={() => {
                    setSelectedNetworkFilter(network);
                    setIsNetworkDropdownOpen(false);
                  }}
                >
                  <NetworkIcon className="h-6 w-6" network={network} />
                  <span>{getNetworkDisplayName(network)}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
