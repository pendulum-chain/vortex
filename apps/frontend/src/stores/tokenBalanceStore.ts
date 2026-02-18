import { ApiPromise } from "@polkadot/api";
import { create } from "zustand";
import { BalanceMap, fetchAllBalances, getBalanceKey, TokenBalance } from "../services/balances";

interface TokenBalanceState {
  balances: BalanceMap;
  isLoading: boolean;
  lastEvmAddress: string | null;
  lastSubstrateAddress: string | null;
  error: string | null;
}

interface TokenBalanceActions {
  fetchBalances: (evmAddress: string | null, substrateAddress: string | null, assethubApi?: ApiPromise) => Promise<void>;
  getBalance: (network: string, symbol: string) => TokenBalance | undefined;
  clearBalances: () => void;
}

interface TokenBalanceStore {
  state: TokenBalanceState;
  actions: TokenBalanceActions;
}

const initialState: TokenBalanceState = {
  balances: new Map(),
  error: null,
  isLoading: false,
  lastEvmAddress: null,
  lastSubstrateAddress: null
};

export const useTokenBalanceStore = create<TokenBalanceStore>((set, get) => ({
  actions: {
    clearBalances: () => set({ state: { ...initialState } }),

    fetchBalances: async (evmAddress, substrateAddress, assethubApi) => {
      const currentState = get().state;

      if (currentState.lastEvmAddress === evmAddress && currentState.lastSubstrateAddress === substrateAddress) {
        return;
      }

      set({ state: { ...currentState, error: null, isLoading: true } });

      try {
        const balances = await fetchAllBalances({ assethubApi, evmAddress, substrateAddress });

        set({
          state: {
            balances,
            error: null,
            isLoading: false,
            lastEvmAddress: evmAddress,
            lastSubstrateAddress: substrateAddress
          }
        });
      } catch (error) {
        console.error("Error fetching token balances:", error);
        set({
          state: {
            ...get().state,
            error: error instanceof Error ? error.message : "Failed to fetch balances",
            isLoading: false
          }
        });
      }
    },

    getBalance: (network, symbol) => {
      return get().state.balances.get(getBalanceKey(network, symbol));
    }
  },
  state: initialState
}));

export const useTokenBalances = () => useTokenBalanceStore(state => state.state.balances);
export const useTokenBalancesLoading = () => useTokenBalanceStore(state => state.state.isLoading);
export const useTokenBalanceActions = () => useTokenBalanceStore(state => state.actions);

export const useTokenBalance = (network: string, symbol: string): TokenBalance | undefined => {
  return useTokenBalanceStore(state => state.state.balances.get(getBalanceKey(network, symbol)));
};
