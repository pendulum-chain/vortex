import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { FiatToken, getNetworkDisplayName, Networks, OnChainToken } from "@packages/shared";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ALL_NETWORKS_ICON from "../../../assets/chains/all-networks.svg";
import { isFiatTokenDisabled } from "../../../config/tokenAvailability";
import { useNetwork } from "../../../contexts/network";
import { cn } from "../../../helpers/cn";
import { useFiatToken, useOnChainToken, useRampFormStoreActions } from "../../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useRampModalActions, useRampModalState } from "../../../stores/rampModalStore";
import { NetworkIcon } from "../../NetworkIcon";
import { RampDirection } from "../../RampToggle";
import { SearchInput } from "../../SearchInput";
import { PoolListItem } from "../PoolListItem";
import { ExtendedTokenDefinition } from "../SelectionModal";
import { useTokenDefinitions } from "./helpers";

interface NetworkDropdownProps {
  isNetworkDropdownOpen: boolean;
  setIsNetworkDropdownOpen: (value: boolean) => void;
}

const NetworkDropdown = ({ isNetworkDropdownOpen, setIsNetworkDropdownOpen }: NetworkDropdownProps) => {
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
            height: "auto",
            transition: {
              damping: 50,
              delay: 0.25,
              duration: 0.5,
              stiffness: 600,
              type: "spring"
            }
          }}
          className="absolute top-[3.1rem] left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white"
          exit={{
            height: 0,
            transition: {
              damping: 50,
              delay: 0,
              duration: 0.5,
              stiffness: 600,
              type: "spring"
            }
          }}
          initial={{ height: 0 }}
          key="network-dropdown"
          style={{ maxHeight: "calc(100vh - 3.1rem)" }}
        >
          <div className="w-full p-4">
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
    <div className="relative">
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
          "mt-5 flex flex-col gap-2 transition-opacity duration-300",
          isNetworkDropdownOpen ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
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
  );
}
