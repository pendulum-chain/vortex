import { Networks } from "@packages/shared";
import { create } from "zustand";

interface TokenModalState {
  // Modal state
  isOpen: boolean;
  isLoading: boolean;
  tokenSelectModalType: "from" | "to";

  // Filter state
  searchFilter: string;
  selectedNetworkFilter: Networks | "all";
  isNetworkDropdownOpen: boolean;
}

interface TokenModalActions {
  openTokenSelectModal: (type: "from" | "to") => void;
  closeTokenSelectModal: () => void;
  setSearchFilter: (filter: string) => void;
  setSelectedNetworkFilter: (network: Networks | "all") => void;
  setIsNetworkDropdownOpen: (isOpen: boolean) => void;
  toggleNetworkDropdown: () => void;
  resetFilters: () => void;
  closeDropdowns: () => void;
}

interface TokenModalStore {
  state: TokenModalState;
  actions: TokenModalActions;
}

export const useTokenModalStore = create<TokenModalStore>(set => ({
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
export const useTokenModalState = () => useTokenModalStore(state => state.state);
export const useTokenModalActions = () => useTokenModalStore(state => state.actions);

// Specific state hooks for commonly used values
export const useSearchFilter = () => useTokenModalStore(state => state.state.searchFilter);
export const useSelectedNetworkFilter = () => useTokenModalStore(state => state.state.selectedNetworkFilter);
export const useIsNetworkDropdownOpen = () => useTokenModalStore(state => state.state.isNetworkDropdownOpen);
