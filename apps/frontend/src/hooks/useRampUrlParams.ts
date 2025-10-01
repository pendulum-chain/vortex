import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken, RampDirection } from "@packages/shared";
import { useEffect, useMemo, useRef } from "react";
import { getFirstEnabledFiatToken, isFiatTokenEnabled } from "../config/tokenAvailability";
import { useNetwork } from "../contexts/network";
import { useRampActor } from "../contexts/rampState";
import { DEFAULT_RAMP_DIRECTION } from "../helpers/path";
import { useSetPartnerId } from "../stores/partnerStore";
import { defaultFiatTokenAmounts, useQuoteFormStoreActions } from "../stores/quote/useQuoteFormStore";
import { useRampDirection, useRampDirectionReset, useRampDirectionToggle } from "../stores/rampDirectionStore";

interface RampUrlParams {
  ramp: RampDirection;
  network?: Networks;
  to?: string;
  from?: string;
  fromAmount?: string;
  partnerId?: string;
  providedQuoteId?: string;
  moneriumCode?: string;
}

function findFiatToken(fiatToken?: string, rampDirection?: RampDirection): FiatToken | undefined {
  if (!fiatToken) {
    return undefined;
  }

  const fiatTokenEntries = Object.entries(FiatToken);
  const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toUpperCase() === fiatToken);

  if (!matchedFiatToken) {
    return undefined;
  }

  const [_, tokenValue] = matchedFiatToken;
  const foundToken = tokenValue as FiatToken;

  if (rampDirection === RampDirection.BUY && foundToken !== FiatToken.BRL) {
    return FiatToken.BRL;
  }

  return foundToken;
}

function findOnChainToken(tokenStr?: string, networkType?: Networks | string): OnChainToken | undefined {
  if (!tokenStr || !networkType) {
    return undefined;
  }

  const isAssetHub = networkType === Networks.AssetHub;

  if (isAssetHub) {
    const assetHubTokenEntries = Object.entries(AssetHubToken);
    const matchedToken = assetHubTokenEntries.find(([_, token]) => token.toUpperCase() === tokenStr);

    if (!matchedToken) {
      return AssetHubToken.USDC;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as unknown as OnChainToken;
  } else {
    const evmTokenEntries = Object.entries(EvmToken);
    const matchedToken = evmTokenEntries.find(([_, token]) => token.toUpperCase() === tokenStr);

    if (!matchedToken) {
      return EvmToken.USDC;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as OnChainToken;
  }
}

function getNetworkFromParam(param?: string): Networks | undefined {
  if (param) {
    const matchedNetwork = Object.values(Networks).find(network => network.toLowerCase() === param);
    return matchedNetwork;
  }
  return undefined;
}

export const useRampUrlParams = (): RampUrlParams => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();

  const urlParams = useMemo(() => {
    const rampParam = params.get("ramp")?.toLowerCase();
    const networkParam = params.get("network")?.toLowerCase();
    const toTokenParam = params.get("to")?.toUpperCase();
    const fromTokenParam = params.get("from")?.toUpperCase();
    const inputAmountParam = params.get("fromAmount");
    const partnerIdParam = params.get("partnerId");
    const moneriumCode = params.get("code")?.toLowerCase();
    const providedQuoteId = params.get("quoteId")?.toLowerCase();

    const ramp =
      rampParam === undefined
        ? rampDirection
        : rampParam === RampDirection.SELL
          ? RampDirection.SELL
          : rampParam === RampDirection.BUY
            ? RampDirection.BUY
            : DEFAULT_RAMP_DIRECTION;

    const from =
      ramp === RampDirection.SELL
        ? findOnChainToken(fromTokenParam, networkParam || selectedNetwork)
        : findFiatToken(fromTokenParam, ramp);
    const to =
      ramp === RampDirection.SELL
        ? findFiatToken(toTokenParam, ramp)
        : findOnChainToken(toTokenParam, networkParam || selectedNetwork);

    const fromAmount =
      ramp === RampDirection.SELL ? defaultFiatTokenAmounts[to as FiatToken] : defaultFiatTokenAmounts[from as FiatToken];

    return {
      from,
      fromAmount: inputAmountParam || fromAmount || undefined,
      moneriumCode,
      network: getNetworkFromParam(networkParam),
      partnerId: partnerIdParam || undefined,
      providedQuoteId,
      ramp,
      to
    };
  }, [params, rampDirection, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const { ramp, to, from, fromAmount, partnerId, providedQuoteId } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();
  const _resetRampDirection = useRampDirectionReset();
  const setPartnerIdFn = useSetPartnerId();

  const rampActor = useRampActor();

  const { setFiatToken, setOnChainToken, setInputAmount, reset: resetRampForm } = useQuoteFormStoreActions();

  const hasInitialized = useRef(false);

  const handleFiatToken = (token: FiatToken) => {
    if (isFiatTokenEnabled(token)) {
      setFiatToken(token);
    } else {
      setFiatToken(getFirstEnabledFiatToken());
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation> Empty dependency array means run once on mount
  useEffect(() => {
    if (providedQuoteId) {
      const quote = rampActor.getSnapshot()?.context.quote;
      if (quote?.id !== providedQuoteId) {
        rampActor.send({ quoteId: providedQuoteId, type: "SET_QUOTE" });
      }
    }

    // We only set the other params once, if not in widget mode.
    const isWidget = window.location.pathname.includes("/widget");
    if (providedQuoteId || isWidget) return;

    if (hasInitialized.current) return;

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    const params = new URLSearchParams(window.location.search);
    const persistState = params.get("code") !== null;

    if (persistState) {
      // If the persist flag is set, the ramp direction is already persisted
      // and will be automatically loaded from localStorage by the store.
      // We skip the rest of the initialization logic to preserve all persisted state.
      hasInitialized.current = true;
      return;
    }

    // resetRampDirection();
    resetRampForm();

    onToggle(ramp);

    if (to) {
      if (ramp === RampDirection.SELL) {
        handleFiatToken(to as FiatToken);
      } else {
        setOnChainToken(to as OnChainToken);
      }
    }

    if (from) {
      if (ramp === RampDirection.SELL) {
        setOnChainToken(from as OnChainToken);
      } else {
        handleFiatToken(from as FiatToken);
      }
    }

    if (fromAmount) {
      setInputAmount(fromAmount);
    }

    hasInitialized.current = true;
  }, []); // Empty dependency array means run once on mount
};
