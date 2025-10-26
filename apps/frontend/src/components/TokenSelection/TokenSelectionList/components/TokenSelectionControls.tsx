import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../../helpers/cn";
import { useIsNetworkDropdownOpen, useTokenSelectionActions } from "../../../../stores/tokenSelectionStore";
import { SearchInput } from "../../../SearchInput";
import { NetworkDropdown } from "../../NetworkSelectionList";

const TokenSelectionSearchInput = () => {
  const { t } = useTranslation();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const { setSearchFilter } = useTokenSelectionActions();

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
      transition={{
        delay: isNetworkDropdownOpen ? 0 : 0.3,
        duration: isNetworkDropdownOpen ? 0 : 0.15,
        ease: "linear"
      }}
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
  <div className="relative flex flex-wrap items-center justify-between gap-2 transition-all">
    <NetworkDropdown />
    <TokenSelectionSearchInput />
  </div>
);
