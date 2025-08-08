import { useTranslation } from "react-i18next";
import { cn } from "../../../../helpers/cn";
import { useIsNetworkDropdownOpen, useTokenModalActions } from "../../../../stores/rampModalStore";
import { SearchInput } from "../../../SearchInput";
import { NetworkDropdown } from "../../NetworkSelectionList";

const TokenSelectionSearchInput = () => {
  const { t } = useTranslation();
  const isNetworkDropdownOpen = useIsNetworkDropdownOpen();
  const { setSearchFilter } = useTokenModalActions();

  const handleSearchChange = (value: string) => {
    setSearchFilter(value);
  };

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
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
        set={handleSearchChange}
      />
    </div>
  );
};

export const TokenSelectionControls = () => (
  <div className="relative flex flex-wrap items-center justify-between gap-2 transition-all">
    <NetworkDropdown />
    <TokenSelectionSearchInput />
  </div>
);
