import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
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
  const searchParams = useSearch({ strict: false }) as Record<string, unknown>;

  useEffect(() => {
    const newValues: Record<string, string | undefined> = {
      cryptoLocked: onChainToken,
      fiat: fiatToken,
      inputAmount: inputAmount || undefined,
      network: selectedNetwork,
      rampType: rampDirection
    };

    const alreadyInSync = Object.entries(newValues).every(
      ([key, value]) => (value === undefined && !(key in searchParams)) || String(searchParams[key] ?? "") === value
    );

    if (alreadyInSync) return;

    navigate({
      replace: true,
      search: {
        ...searchParams,
        ...newValues
      },
      to: "."
    });
  }, [inputAmount, onChainToken, fiatToken, rampDirection, selectedNetwork, navigate, searchParams]);
};
