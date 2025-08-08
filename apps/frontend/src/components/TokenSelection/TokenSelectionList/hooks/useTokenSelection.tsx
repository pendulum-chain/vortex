import { FiatToken, FiatTokenDetails, Networks, OnChainToken, OnChainTokenDetails } from "@packages/shared";
import { isFiatTokenDisabled } from "../../../../config/tokenAvailability";
import { useNetwork } from "../../../../contexts/network";
import { useFiatToken, useOnChainToken, useRampFormStoreActions } from "../../../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../../../stores/rampDirectionStore";
import { useTokenModalActions, useTokenModalState } from "../../../../stores/rampModalStore";
import { RampDirection } from "../../../RampToggle";

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
  const { tokenSelectModalType } = useTokenModalState();
  const { closeTokenSelectModal } = useTokenModalActions();
  const { setSelectedNetwork } = useNetwork();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const { setFiatToken, setOnChainToken } = useRampFormStoreActions();
  const rampDirection = useRampDirection();

  const handleTokenSelect = async (token: OnChainToken | FiatToken, tokenDefinition: ExtendedTokenDefinition) => {
    const isFiatToken = Object.values(FiatToken).includes(token as FiatToken);
    if (isFiatToken && isFiatTokenDisabled(token as FiatToken)) {
      return;
    }

    if (!isFiatToken) {
      await setSelectedNetwork(tokenDefinition.network);
    }

    if (rampDirection === RampDirection.ONRAMP) {
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
    return rampDirection === RampDirection.ONRAMP
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
