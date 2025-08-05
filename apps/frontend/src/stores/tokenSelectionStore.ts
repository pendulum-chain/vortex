import { Networks } from "@packages/shared";
import { useCallback } from "react";
import { create } from "zustand";

interface TokenSelectionState {
  searchFilter: string;
  selectedNetworkFilter: Networks | "all";
  isNetworkDropdownOpen: boolean;
  setSearchFilter: (filter: string) => void;
  setSelectedNetworkFilter: (network: Networks | "all") => void;
  setIsNetworkDropdownOpen: (isOpen: boolean) => void;
  toggleNetworkDropdown: () => void;
  resetFilters: () => void;
  closeDropdowns: () => void;
}

export const useTokenSelectionStore = create<TokenSelectionState>(set => ({
  closeDropdowns: () => set({ isNetworkDropdownOpen: false }),
  isNetworkDropdownOpen: false,

  resetFilters: () =>
    set({
      isNetworkDropdownOpen: false,
      searchFilter: "",
      selectedNetworkFilter: "all"
    }),
  searchFilter: "",
  selectedNetworkFilter: "all",

  setIsNetworkDropdownOpen: (isOpen: boolean) => set({ isNetworkDropdownOpen: isOpen }),

  setSearchFilter: (filter: string) => set({ searchFilter: filter }),

  setSelectedNetworkFilter: (network: Networks | "all") =>
    set({
      isNetworkDropdownOpen: false,
      selectedNetworkFilter: network
    }),

  toggleNetworkDropdown: () => set(state => ({ isNetworkDropdownOpen: !state.isNetworkDropdownOpen }))
}));

export const useSearchFilter = () => useTokenSelectionStore(state => state.searchFilter);
export const useSelectedNetworkFilter = () => useTokenSelectionStore(state => state.selectedNetworkFilter);
export const useIsNetworkDropdownOpen = () => useTokenSelectionStore(state => state.isNetworkDropdownOpen);

export const useSetSearchFilter = () => useTokenSelectionStore(state => state.setSearchFilter);
export const useSetSelectedNetworkFilter = () => useTokenSelectionStore(state => state.setSelectedNetworkFilter);
export const useSetIsNetworkDropdownOpen = () => useTokenSelectionStore(state => state.setIsNetworkDropdownOpen);
export const useToggleNetworkDropdown = () => useTokenSelectionStore(state => state.toggleNetworkDropdown);
export const useResetFilters = () => useTokenSelectionStore(state => state.resetFilters);
export const useCloseDropdowns = () => useTokenSelectionStore(state => state.closeDropdowns);

export const useTokenSelectionState = () =>
  useTokenSelectionStore(state => ({
    isNetworkDropdownOpen: state.isNetworkDropdownOpen,
    searchFilter: state.searchFilter,
    selectedNetworkFilter: state.selectedNetworkFilter
  }));

export const useTokenSelectionActions = () => {
  const setSearchFilter = useSetSearchFilter();
  const setSelectedNetworkFilter = useSetSelectedNetworkFilter();
  const setIsNetworkDropdownOpen = useSetIsNetworkDropdownOpen();
  const toggleNetworkDropdown = useToggleNetworkDropdown();
  const resetFilters = useResetFilters();
  const closeDropdowns = useCloseDropdowns();

  return useCallback(
    () => ({
      closeDropdowns,
      resetFilters,
      setIsNetworkDropdownOpen,
      setSearchFilter,
      setSelectedNetworkFilter,
      toggleNetworkDropdown
    }),
    [setSearchFilter, setSelectedNetworkFilter, setIsNetworkDropdownOpen, toggleNetworkDropdown, resetFilters, closeDropdowns]
  )();
};
