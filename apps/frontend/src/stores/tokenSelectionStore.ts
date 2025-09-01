import { Networks } from "@packages/shared";
import { create } from "zustand";

interface TokenSelectionState {
  // Modal state
  isOpen: boolean;
  isLoading: boolean;
  tokenSelectModalType: "from" | "to";

  // Filter state
  searchFilter: string;
  selectedNetworkFilter: Networks | "all";
  isNetworkDropdownOpen: boolean;
}

interface TokenSelectionActions {
  openTokenSelectModal: (type: "from" | "to") => void;
  closeTokenSelectModal: () => void;
  setSearchFilter: (filter: string) => void;
  setSelectedNetworkFilter: (network: Networks | "all") => void;
  setIsNetworkDropdownOpen: (isOpen: boolean) => void;
  toggleNetworkDropdown: () => void;
  resetFilters: () => void;
  closeDropdowns: () => void;
}

interface TokenSelectionStore {
  state: TokenSelectionState;
  actions: TokenSelectionActions;
}

export const useTokenSelectionStore = create<TokenSelectionStore>(set => ({
  actions: {
    closeDropdowns: () =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: false
        }
      })),

    closeTokenSelectModal: () =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: false,
          isOpen: false,
          // Auto-reset filters when closing modal
          searchFilter: "",
          selectedNetworkFilter: "all"
        }
      })),
    openTokenSelectModal: (type: "from" | "to") =>
      set(state => ({
        state: {
          ...state.state,
          isOpen: true,
          tokenSelectModalType: type
        }
      })),

    resetFilters: () =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: false,
          searchFilter: "",
          selectedNetworkFilter: "all"
        }
      })),

    setIsNetworkDropdownOpen: (isOpen: boolean) =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: isOpen
        }
      })),

    setSearchFilter: (filter: string) =>
      set(state => ({
        state: {
          ...state.state,
          searchFilter: filter
        }
      })),

    setSelectedNetworkFilter: (network: Networks | "all") =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: false,
          selectedNetworkFilter: network
        }
      })),

    toggleNetworkDropdown: () =>
      set(state => ({
        state: {
          ...state.state,
          isNetworkDropdownOpen: !state.state.isNetworkDropdownOpen
        }
      }))
  },
  state: {
    isLoading: false,
    isNetworkDropdownOpen: false,
    isOpen: false,
    searchFilter: "",
    selectedNetworkFilter: "all",
    tokenSelectModalType: "from"
  }
}));

// Hook exports
export const useTokenSelectionState = () => useTokenSelectionStore(state => state.state);
export const useTokenSelectionActions = () => useTokenSelectionStore(state => state.actions);

// Specific state hooks for commonly used values
export const useSearchFilter = () => useTokenSelectionStore(state => state.state.searchFilter);
export const useSelectedNetworkFilter = () => useTokenSelectionStore(state => state.state.selectedNetworkFilter);
export const useIsNetworkDropdownOpen = () => useTokenSelectionStore(state => state.state.isNetworkDropdownOpen);
