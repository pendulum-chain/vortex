import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken, getOnChainTokenDetails } from '@packages/shared';
import { create } from 'zustand';
import { Language, getLanguageFromPath } from '../../translations/helpers';

export const DEFAULT_FIAT_TOKEN = FiatToken.EURC;
export const DEFAULT_PT_BR_TOKEN = FiatToken.BRL;

export const DEFAULT_BRL_AMOUNT = '100';
export const DEFAULT_EURC_AMOUNT = '20';
export const DEFAULT_ARS_AMOUNT = '20';

export const defaultFiatTokenAmounts: Record<FiatToken, string> = {
  [FiatToken.EURC]: DEFAULT_EURC_AMOUNT,
  [FiatToken.ARS]: DEFAULT_ARS_AMOUNT,
  [FiatToken.BRL]: DEFAULT_BRL_AMOUNT,
};

export const DEFAULT_ASSETHUB_ONCHAIN_TOKEN = AssetHubToken.USDC;
export const DEFAULT_EVM_ONCHAIN_TOKEN = EvmToken.USDC;

const defaultFiatToken =
  getLanguageFromPath() === Language.Portuguese_Brazil ? DEFAULT_PT_BR_TOKEN : DEFAULT_FIAT_TOKEN;

const defaultFiatAmount =
  getLanguageFromPath() === Language.Portuguese_Brazil ? DEFAULT_BRL_AMOUNT : defaultFiatTokenAmounts[defaultFiatToken];

interface RampFormState {
  inputAmount?: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  taxId?: string;
  pixId?: string;
}

interface RampFormActions {
  actions: {
    setInputAmount: (amount?: string) => void;
    setOnChainToken: (token: OnChainToken) => void;
    setFiatToken: (token: FiatToken) => void;
    setTaxId: (taxId: string) => void;
    setPixId: (pixId: string) => void;
    handleNetworkChange: (network: Networks) => void;
    reset: () => void;
  };
}

const storedNetwork = localStorage.getItem('SELECTED_NETWORK');

export const DEFAULT_RAMP_FORM_STORE_VALUES: RampFormState = {
  inputAmount: defaultFiatAmount,
  onChainToken: storedNetwork !== null && storedNetwork === Networks.AssetHub ? EvmToken.USDC : EvmToken.USDT,
  fiatToken: defaultFiatToken,
  taxId: undefined,
  pixId: undefined,
};

export const useRampFormStore = create<RampFormState & RampFormActions>((set, get) => ({
  ...DEFAULT_RAMP_FORM_STORE_VALUES,
  actions: {
    setInputAmount: (amount?: string) => set({ inputAmount: amount }),
    setOnChainToken: (token: OnChainToken) => set({ onChainToken: token }),
    setFiatToken: (token: FiatToken) => set({ fiatToken: token }),
    setTaxId: (taxId: string) => set({ taxId }),
    setPixId: (pixId: string) => set({ pixId }),

    handleNetworkChange: (network: Networks) => {
      const { onChainToken } = get();
      const onChainTokenDetails = getOnChainTokenDetails(network, onChainToken);
      if (!onChainTokenDetails) {
        // USDC is supported on all networks
        set({ onChainToken: EvmToken.USDC });
      }
    },

    reset: () => {
      set({
        ...DEFAULT_RAMP_FORM_STORE_VALUES,
      });
    },
  },
}));

export const useInputAmount = () => useRampFormStore((state) => state.inputAmount);
export const useOnChainToken = () => useRampFormStore((state) => state.onChainToken);
export const useFiatToken = () => useRampFormStore((state) => state.fiatToken);
export const useTaxId = () => useRampFormStore((state) => state.taxId);
export const usePixId = () => useRampFormStore((state) => state.pixId);

export const useRampFormStoreActions = () => useRampFormStore((state) => state.actions);
