import {
  AssetHubToken,
  EvmToken,
  FiatToken,
  getOnChainTokenDetails,
  Networks,
  OnChainToken,
  RampDirection
} from "@packages/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRampDirectionFromPath } from "../../helpers/path";
import { getLanguageFromPath, Language } from "../../translations/helpers";
import { useRampDirection } from "../rampDirectionStore";

export const DEFAULT_FIAT_TOKEN = FiatToken.EURC;
export const DEFAULT_PT_BR_TOKEN = FiatToken.BRL;

export const DEFAULT_BRL_AMOUNT = "100";
export const DEFAULT_EURC_AMOUNT = "20";
export const DEFAULT_ARS_AMOUNT = "20";

export const defaultFiatTokenAmounts: Record<FiatToken, string> = {
  [FiatToken.EURC]: DEFAULT_EURC_AMOUNT,
  [FiatToken.ARS]: DEFAULT_ARS_AMOUNT,
  [FiatToken.BRL]: DEFAULT_BRL_AMOUNT
};

const defaultFiatToken = getLanguageFromPath() === Language.Portuguese_Brazil ? DEFAULT_PT_BR_TOKEN : DEFAULT_FIAT_TOKEN;

const defaultFiatAmount =
  getLanguageFromPath() === Language.Portuguese_Brazil ? DEFAULT_BRL_AMOUNT : defaultFiatTokenAmounts[defaultFiatToken];

const storedNetwork = localStorage.getItem("SELECTED_NETWORK");

const defaultOnChainToken =
  getRampDirectionFromPath() === RampDirection.BUY
    ? storedNetwork === Networks.AssetHub
      ? AssetHubToken.USDC
      : EvmToken.USDT
    : EvmToken.USDC;

interface RampFormState {
  inputAmount: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  taxId?: string;
  pixId?: string;
  providedQuoteId?: string;
  lastConstraintDirection: RampDirection;
}

interface RampFormActions {
  actions: {
    setInputAmount: (amount?: string) => void;
    setOnChainToken: (token: OnChainToken) => void;
    setFiatToken: (token: FiatToken) => void;
    setTaxId: (taxId: string) => void;
    setPixId: (pixId: string) => void;
    setProvidedQuoteId: (quoteId?: string) => void;
    setConstraintDirection: (direction: RampDirection) => void;
    handleNetworkChange: (network: Networks) => void;
    reset: () => void;
  };
}

export const DEFAULT_RAMP_FORM_STORE_VALUES: RampFormState = {
  fiatToken: defaultFiatToken,
  inputAmount: defaultFiatAmount,
  lastConstraintDirection: getRampDirectionFromPath(),
  onChainToken: defaultOnChainToken,
  pixId: undefined,
  providedQuoteId: undefined,
  taxId: undefined
};

export const useRampFormStore = create<RampFormState & RampFormActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_RAMP_FORM_STORE_VALUES,
      actions: {
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
            ...DEFAULT_RAMP_FORM_STORE_VALUES
          });
        },
        setConstraintDirection: (direction: RampDirection) => set({ lastConstraintDirection: direction }),
        setFiatToken: (token: FiatToken) => set({ fiatToken: token }),
        setInputAmount: (amount?: string) => set({ inputAmount: amount }),
        setOnChainToken: (token: OnChainToken) => set({ onChainToken: token }),
        setPixId: (pixId: string) => set({ pixId }),
        setProvidedQuoteId: (quoteId?: string) => {
          console.log("Settnig providedQuoteId in RampFormStore", quoteId);
          return set({ providedQuoteId: quoteId });
        },
        setTaxId: (taxId: string) => set({ taxId })
      }
    }),
    {
      name: "useRampFormStore",
      partialize: state => ({
        fiatToken: state.fiatToken,
        inputAmount: state.inputAmount,
        lastConstraintDirection: state.lastConstraintDirection,
        onChainToken: state.onChainToken,
        pixId: state.pixId,
        providedQuoteId: state.providedQuoteId,
        taxId: state.taxId
      })
    }
  )
);

export const useInputAmount = () => useRampFormStore(state => state.inputAmount);
export const useOnChainToken = () => useRampFormStore(state => state.onChainToken);
export const useFiatToken = () => useRampFormStore(state => state.fiatToken);
export const useTaxId = () => useRampFormStore(state => state.taxId);
export const usePixId = () => useRampFormStore(state => state.pixId);
export const useProvidedQuoteId = () => useRampFormStore(state => state.providedQuoteId);
export const useLastConstraintDirection = () => useRampFormStore(state => state.lastConstraintDirection);

export const useQuoteConstraintsValid = () => {
  const direction = useRampDirection();
  const lastConstraintDirection = useLastConstraintDirection();
  return direction === lastConstraintDirection;
};

export const useRampFormStoreActions = () => useRampFormStore(state => state.actions);
