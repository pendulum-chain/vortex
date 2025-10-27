import {
  AssetHubToken,
  DestinationType,
  EvmToken,
  FiatToken,
  Networks,
  OnChainToken,
  PaymentMethod,
  QuoteResponse,
  RampDirection
} from "@packages/shared";
import Big from "big.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getFirstEnabledFiatToken, isFiatTokenEnabled } from "../config/tokenAvailability";
import { useNetwork } from "../contexts/network";
import { useRampActor } from "../contexts/rampState";
import { DEFAULT_RAMP_DIRECTION } from "../helpers/path";
import { QuoteService } from "../services/api";
import { useSetPartnerId } from "../stores/partnerStore";
import { useQuoteFormStoreActions } from "../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../stores/quote/useQuoteStore";
import { useRampDirection, useRampDirectionToggle } from "../stores/rampDirectionStore";

interface RampUrlParams {
  rampDirection: RampDirection;
  network?: Networks;
  inputAmount?: string;
  partnerId?: string;
  providedQuoteId?: string;
  moneriumCode?: string;
  fiat?: FiatToken;
  countryCode?: string;
  cryptoLocked?: OnChainToken;
  paymentMethod?: PaymentMethod;
  walletLocked?: string;
  callbackUrl?: string;
  externalSessionId?: string;
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

  return foundToken;
}

function findOnChainToken(tokenStr?: string, networkType?: Networks | string): OnChainToken | undefined {
  if (!tokenStr || !networkType) {
    return undefined;
  }

  const isAssetHub = networkType === Networks.AssetHub;

  if (isAssetHub) {
    const assethubTokenEntries = Object.entries(AssetHubToken);
    const matchedToken = assethubTokenEntries.find(([_, token]) => token.toUpperCase() === tokenStr);

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

const mapFiatToDestination = (fiatToken: FiatToken): DestinationType => {
  const destinationMap: Record<FiatToken, DestinationType> = {
    ARS: "cbu",
    BRL: "pix",
    EUR: "sepa"
  };

  return destinationMap[fiatToken] || "sepa";
};

interface QuoteParams {
  inputAmount?: Big;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  selectedNetwork: DestinationType;
  rampType: RampDirection;
  partnerId?: string;
}

interface QuotePayload {
  rampType: RampDirection;
  fromDestination: DestinationType;
  toDestination: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputCurrency: OnChainToken | FiatToken;
}

const createQuotePayload = (params: QuoteParams): QuotePayload => {
  const { inputAmount, onChainToken, fiatToken, selectedNetwork, rampType } = params;
  const fiatDestination = mapFiatToDestination(fiatToken);
  const inputAmountStr = inputAmount?.toString() || "0";

  const payloadMap: Record<RampDirection, QuotePayload> = {
    [RampDirection.SELL]: {
      fromDestination: selectedNetwork,
      inputAmount: inputAmountStr,
      inputCurrency: onChainToken,
      outputCurrency: fiatToken,
      rampType: RampDirection.SELL,
      toDestination: fiatDestination
    },
    [RampDirection.BUY]: {
      fromDestination: fiatDestination,
      inputAmount: inputAmountStr,
      inputCurrency: fiatToken,
      outputCurrency: onChainToken,
      rampType: RampDirection.BUY,
      toDestination: selectedNetwork
    }
  };

  return payloadMap[rampType];
};

export const useRampUrlParams = (): RampUrlParams => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const { selectedNetwork } = useNetwork();
  const rampDirectionStore = useRampDirection();

  const urlParams = useMemo(() => {
    const rampDirectionParam = params.get("rampType")?.toUpperCase();
    const networkParam = params.get("network")?.toLowerCase();
    const inputAmountParam = params.get("inputAmount");
    const partnerIdParam = params.get("partnerId");
    const moneriumCode = params.get("code")?.toLowerCase();
    const providedQuoteId = params.get("quoteId")?.toLowerCase();
    const fiatParam = params.get("fiat")?.toUpperCase();
    const cryptoLockedParam = params.get("cryptoLocked")?.toUpperCase();
    const paymentMethodParam = params.get("paymentMethod") as PaymentMethod | undefined;
    const walletLockedParam = params.get("walletAddressLocked");
    const callbackUrlParam = params.get("callbackUrl");
    const externalSessionIdParam = params.get("externalSessionId");
    const countryCodeParam = params.get("countryCode")?.toUpperCase();

    const rampDirection =
      rampDirectionParam === RampDirection.BUY || rampDirectionParam === RampDirection.SELL
        ? (rampDirectionParam as RampDirection)
        : rampDirectionStore || DEFAULT_RAMP_DIRECTION;

    const network = getNetworkFromParam(networkParam);
    const fiat = findFiatToken(fiatParam, rampDirection);
    const cryptoLocked = findOnChainToken(cryptoLockedParam, network || selectedNetwork);

    return {
      callbackUrl: callbackUrlParam || undefined,
      countryCode: countryCodeParam || undefined,
      cryptoLocked,
      externalSessionId: externalSessionIdParam || undefined,
      fiat,
      inputAmount: inputAmountParam || undefined,
      moneriumCode,
      network,
      partnerId: partnerIdParam || undefined,
      paymentMethod: paymentMethodParam || undefined,
      providedQuoteId,
      rampDirection,
      walletLocked: walletLockedParam || undefined
    };
  }, [params, rampDirectionStore, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const {
    rampDirection,
    inputAmount,
    partnerId,
    providedQuoteId,
    network,
    fiat,
    cryptoLocked,
    countryCode,
    paymentMethod,
    walletLocked,
    callbackUrl,
    externalSessionId
  } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();
  const setPartnerIdFn = useSetPartnerId();
  const {
    actions: { forceSetQuote }
  } = useQuoteStore();

  const rampActor = useRampActor();

  const { setFiatToken, setOnChainToken, setInputAmount, reset: resetRampForm } = useQuoteFormStoreActions();

  const hasInitialized = useRef(false);

  const handleFiatToken = useCallback(
    (token: FiatToken) => {
      if (isFiatTokenEnabled(token)) {
        setFiatToken(token);
      } else {
        setFiatToken(getFirstEnabledFiatToken());
      }
    },
    [setFiatToken]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation> Empty dependency array means run once on mount
  useEffect(() => {
    // effect to read params when at /widget path
    const isWidget = window.location.pathname.includes("/widget");
    if (!isWidget) return;
    if (hasInitialized.current) return;

    // Modify the ramp state machine accordingly
    if (providedQuoteId) {
      const quote = rampActor.getSnapshot()?.context.quote;

      if (externalSessionId) {
        console.log("setting external session id2", externalSessionId);
        rampActor.send({ externalSessionId, type: "SET_EXTERNAL_ID" });
      }

      if (quote?.id !== providedQuoteId) {
        rampActor.send({ callbackUrl, partnerId, type: "SET_QUOTE_PARAMS", walletLocked });
        rampActor.send({ lock: true, quoteId: providedQuoteId, type: "SET_QUOTE" });
      }
    } else {
      // We set these parameters even if the quote fetch fails. Useful for error handling.
      rampActor.send({ callbackUrl, partnerId, type: "SET_QUOTE_PARAMS", walletLocked });
      if (externalSessionId) {
        console.log("setting external session id1", externalSessionId);
        rampActor.send({ externalSessionId, type: "SET_EXTERNAL_ID" });
      }

      if (inputAmount && cryptoLocked && fiat && network && rampDirection) {
        const quoteParams = {
          fiatToken: fiat,
          inputAmount: new Big(inputAmount),
          onChainToken: cryptoLocked,
          partnerId,
          rampType: rampDirection,
          selectedNetwork: network
        };
        const quotePayload = createQuotePayload(quoteParams);

        QuoteService.createQuote(
          quotePayload.rampType,
          quotePayload.fromDestination,
          quotePayload.toDestination,
          quotePayload.inputAmount,
          quotePayload.inputCurrency,
          quotePayload.outputCurrency,
          partnerId,
          paymentMethod,
          countryCode
        )
          .then((newQuote: QuoteResponse) => {
            if (newQuote) {
              forceSetQuote(newQuote);
              rampActor.send({ lock: false, quoteId: newQuote.id, type: "SET_QUOTE" });
            }
          })
          .catch((error: Error) => {
            console.error("Error fetching quote with provided parameters:", error);
            rampActor.send({ type: "INITIAL_QUOTE_FETCH_FAILED" });
          });
      }
    }

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

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
  }, [
    cryptoLocked,
    fiat,
    inputAmount,
    partnerId,
    rampDirection,
    resetRampForm,
    setInputAmount,
    setOnChainToken,
    setPartnerIdFn,
    onToggle,
    handleFiatToken
  ]);
};
