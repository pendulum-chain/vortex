import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { durations, easings } from "../../../../constants/animations";
import { useIsNetworkDropdownOpen, useTokenSelectionActions } from "../../../../stores/tokenSelectionStore";
import { SearchInput } from "../../../SearchInput";
import { NetworkDropdown } from "../../NetworkSelectionList";

const TokenSelectionSearchInput = () => {
  const { t } = useTranslation();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const { setSearchFilter } = useTokenSelectionActions();
  const shouldReduceMotion = useReducedMotion();

  const handleSearchChange = (value: string) => {
    setSearchFilter(value);
  };

  return (
    <motion.div
      animate={{
        flexBasis: isNetworkDropdownOpen ? "0%" : "auto",
        opacity: isNetworkDropdownOpen ? 0 : 1,
        position: isNetworkDropdownOpen ? "absolute" : "relative",
        visibility: isNetworkDropdownOpen ? "hidden" : "visible",
        width: isNetworkDropdownOpen ? 0 : "auto"
      }}
      className="flex-grow"
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              delay: isNetworkDropdownOpen ? 0 : durations.slow,
              duration: isNetworkDropdownOpen ? 0 : durations.fast,
              ease: easings.easeOutCubic
            }
      }
    >
      <SearchInput
        className="w-full"
        placeholder={t("components.dialogs.selectionModal.searchPlaceholder")}
        set={handleSearchChange}
      />
    </motion.div>
  );
};

export const TokenSelectionControls = () => (
  <div className="relative flex flex-wrap items-center justify-between gap-2">
    <NetworkDropdown />
    <TokenSelectionSearchInput />
  </div>
);
