import { FiatToken, FiatTokenDetails, Networks, OnChainToken, OnChainTokenDetails, RampDirection } from "@vortexfi/shared";
import { isFiatTokenDisabled } from "../../../../config/tokenAvailability";
import { useNetwork } from "../../../../contexts/network";
import { useFiatToken, useOnChainToken, useQuoteFormStoreActions } from "../../../../stores/quote/useQuoteFormStore";
import { useRampDirection } from "../../../../stores/rampDirectionStore";
import { useTokenSelectionActions, useTokenSelectionState } from "../../../../stores/tokenSelectionStore";

export interface TokenDefinition {
  assetSymbol: string;
  name?: string;
  assetIcon: string;
  type: OnChainToken | FiatToken;
  details: OnChainTokenDetails | FiatTokenDetails;
}

export interface ExtendedTokenDefinition extends TokenDefinition {
  network: Networks;
  networkDisplayName: string;
}

export const useTokenSelection = () => {
  const { tokenSelectModalType } = useTokenSelectionState();
  const { closeTokenSelectModal } = useTokenSelectionActions();
  const { setSelectedNetwork } = useNetwork();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { setFiatToken, setOnChainToken } = useQuoteFormStoreActions();
  const rampDirection = useRampDirection();

  const handleTokenSelect = async (token: OnChainToken | FiatToken, tokenDefinition: ExtendedTokenDefinition) => {
    const isFiatToken = Object.values(FiatToken).includes(token as FiatToken);
    if (isFiatToken && isFiatTokenDisabled(token as FiatToken)) {
      return;
    }

    if (!isFiatToken) {
      await setSelectedNetwork(tokenDefinition.network);
    }

    if (rampDirection === RampDirection.BUY) {
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

  const getSelectedToken = () => {
    return rampDirection === RampDirection.BUY
      ? tokenSelectModalType === "from"
        ? fiatToken
        : onChainToken
      : tokenSelectModalType === "from"
        ? onChainToken
        : fiatToken;
  };

  return {
    handleTokenSelect,
    selectedToken: getSelectedToken()
  };
};
