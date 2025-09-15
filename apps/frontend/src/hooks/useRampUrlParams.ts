import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken, RampDirection } from "@packages/shared";
import Big from "big.js";
import { useEffect, useMemo, useRef } from "react";
import { getFirstEnabledFiatToken, isFiatTokenEnabled } from "../config/tokenAvailability";
import { useNetwork } from "../contexts/network";
import { useRampActor } from "../contexts/rampState";
import { DEFAULT_RAMP_DIRECTION } from "../helpers/path";
import { useSetPartnerId } from "../stores/partnerStore";
import { defaultFiatTokenAmounts, useQuoteFormStoreActions } from "../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../stores/quote/useQuoteStore";
import { useRampDirection, useRampDirectionReset, useRampDirectionToggle } from "../stores/rampDirectionStore";

interface RampUrlParams {
  rampDirection: RampDirection;
  network?: Networks;
  inputAmount?: string;
  partnerId?: string;
  providedQuoteId?: string;
  moneriumCode?: string;
  fiat?: FiatToken;
  cryptoLocked?: OnChainToken;
  payment?: string;
  walletLocked?: string;
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
  const rampDirectionStore = useRampDirection();

  const urlParams = useMemo(() => {
    const rampDirectionParam = params.get("rampType")?.toLowerCase();
    const networkParam = params.get("network")?.toLowerCase();
    const inputAmountParam = params.get("inputAmount");
    const partnerIdParam = params.get("partnerId");
    const moneriumCode = params.get("code")?.toLowerCase();
    const providedQuoteId = params.get("quoteId")?.toLowerCase();
    const fiatParam = params.get("fiat")?.toUpperCase();
    const cryptoLockedParam = params.get("cryptoLocked")?.toUpperCase();
    const paymentParam = params.get("payment");
    const walletLockedParam = params.get("walletLocked");

    const rampDirection =
      (rampDirectionParam ?? rampDirectionParam === RampDirection.SELL)
        ? RampDirection.SELL
        : rampDirectionParam === RampDirection.BUY
          ? RampDirection.BUY
          : rampDirectionStore;

    const network = getNetworkFromParam(networkParam);
    const fiat = findFiatToken(fiatParam, rampDirection);
    const cryptoLocked = findOnChainToken(cryptoLockedParam, network || selectedNetwork);

    return {
      cryptoLocked,
      fiat,
      inputAmount: inputAmountParam || undefined,
      moneriumCode,
      network,
      partnerId: partnerIdParam || undefined,
      payment: paymentParam || undefined,
      providedQuoteId,
      rampDirection,
      walletLocked: walletLockedParam || undefined
    };
  }, [params, rampDirectionStore, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const { rampDirection, inputAmount, partnerId, providedQuoteId, network, fiat, cryptoLocked } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();
  const setPartnerIdFn = useSetPartnerId();
  const {
    actions: { fetchQuote }
  } = useQuoteStore();

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
    // effect to read params when NOT in /widget path
    const isWidget = window.location.pathname.includes("/widget");
    if (!isWidget) return;
    if (hasInitialized.current) return;

    // Modify the ramp state machine accordingly
    if (providedQuoteId) {
      const quote = rampActor.getSnapshot()?.context.quote;
      if (quote?.id !== providedQuoteId) {
        rampActor.send({ partnerId, type: "SET_PARTNER_ID" });
        rampActor.send({ lock: true, quoteId: providedQuoteId, type: "SET_QUOTE" });
      }
    } else {
      if (inputAmount && cryptoLocked && fiat && network && rampDirection) {
        fetchQuote({
          fiatToken: fiat,
          inputAmount: new Big(inputAmount),
          onChainToken: cryptoLocked,
          partnerId,
          rampType: rampDirection,
          selectedNetwork: network
        }).then(() => {
          const newQuote = useQuoteStore.getState().quote;
          if (newQuote) {
            rampActor.send({ partnerId, type: "SET_PARTNER_ID" });
            rampActor.send({ lock: false, quoteId: newQuote.id, type: "SET_QUOTE" });
          }
        });
      }
    }

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    // const params = new URLSearchParams(window.location.search);
    // const persistState = params.get("code") !== null;

    // if (persistState) {
    //   hasInitialized.current = true;
    //   return;
    // }

    onToggle(rampDirection);

    if (fiat) {
      handleFiatToken(fiat);
    }

    if (cryptoLocked) {
      setOnChainToken(cryptoLocked);
    }

    if (inputAmount) {
      setInputAmount(inputAmount);
    }

    hasInitialized.current = true;
  }, []); // Empty dependency array means run once on mount

  useEffect(() => {
    // effect to read params when NOT in /widget path
    const isWidget = window.location.pathname.includes("/widget");
    if (isWidget) return;

    if (hasInitialized.current) return;

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    const params = new URLSearchParams(window.location.search);
    const persistState = params.get("code") !== null;

    if (persistState) {
      hasInitialized.current = true;
      return;
    }

    resetRampForm();

    onToggle(rampDirection);

    if (fiat) {
      handleFiatToken(fiat);
    }

    if (cryptoLocked) {
      setOnChainToken(cryptoLocked);
    }

    if (inputAmount) {
      setInputAmount(inputAmount);
    }

    hasInitialized.current = true;
  }, []);
};
