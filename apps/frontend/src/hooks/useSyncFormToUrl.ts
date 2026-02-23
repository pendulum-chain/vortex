import { useNavigate } from "@tanstack/react-router";
import { getEvmTokensLoadedSnapshot, isNetworkEVM, Networks, subscribeEvmTokensLoaded } from "@vortexfi/shared";
import { useEffect, useSyncExternalStore } from "react";
import { useNetwork } from "../contexts/network";
import { useFiatToken, useInputAmount, useOnChainToken } from "../stores/quote/useQuoteFormStore";
import { useRampDirection } from "../stores/rampDirectionStore";

export const useSyncFormToUrl = () => {
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const rampDirection = useRampDirection();
  const { selectedNetwork } = useNetwork();
  const navigate = useNavigate();
  const evmTokensLoaded = useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot);

  useEffect(() => {
    navigate({
      replace: true,
      search: prev => {
        const isEvmNetwork = isNetworkEVM(selectedNetwork as Networks);
        const cryptoLockedValue = isEvmNetwork && !evmTokensLoaded && prev.cryptoLocked ? prev.cryptoLocked : onChainToken;

        const newValues = {
          cryptoLocked: cryptoLockedValue,
          fiat: fiatToken,
          inputAmount: inputAmount || undefined,
          network: selectedNetwork,
          rampType: rampDirection
        };

        const alreadyInSync = Object.entries(newValues).every(
          ([key, value]) => (value === undefined && !(key in prev)) || String(prev[key as keyof typeof prev] ?? "") === value
        );

        return alreadyInSync ? prev : { ...prev, ...newValues };
      },
      to: "."
    });
  }, [inputAmount, onChainToken, fiatToken, rampDirection, selectedNetwork, navigate, evmTokensLoaded]);
};
