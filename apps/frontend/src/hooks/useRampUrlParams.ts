import { useSearch } from "@tanstack/react-router";
import {
  AssetHubToken,
  DestinationType,
  EPaymentMethod,
  type EvmNetworks,
  EvmToken,
  FiatToken,
  getEvmTokenConfig,
  getEvmTokensLoadedSnapshot,
  isNetworkEVM,
  logger,
  Networks,
  OnChainToken,
  OnChainTokenSymbol,
  PaymentMethod,
  QuoteResponse,
  RampDirection,
  subscribeEvmTokensLoaded
} from "@vortexfi/shared";
import Big from "big.js";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getFirstEnabledFiatToken, isFiatTokenEnabled } from "../config/tokenAvailability";
import { useNetwork } from "../contexts/network";
import { useRampActor } from "../contexts/rampState";
import { DEFAULT_RAMP_DIRECTION } from "../helpers/path";
import { QuoteService } from "../services/api";
import { useSetApiKey, useSetPartnerId } from "../stores/partnerStore";
import { useQuoteFormStoreActions } from "../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../stores/quote/useQuoteStore";
import { useRampDirection, useRampDirectionToggle } from "../stores/rampDirectionStore";
import { RampSearchParams } from "../types/searchParams";
import { useWidgetMode } from "./useWidgetMode";

interface RampUrlParams {
  rampDirection: RampDirection;
  network?: Networks;
  inputAmount?: string;
  apiKey?: string;
  partnerId?: string;
  providedQuoteId?: string;
  moneriumCode?: string;
  fiat?: FiatToken;
  countryCode?: string;
  cryptoLocked?: OnChainTokenSymbol;
  paymentMethod?: PaymentMethod;
  walletLocked?: string;
  callbackUrl?: string;
  externalSessionId?: string;
}

function findFiatToken(fiatToken?: string): FiatToken | undefined {
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

function findOnChainToken(tokenStr?: string, networkType?: Networks | string): OnChainTokenSymbol | undefined {
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
    if (isNetworkEVM(networkType as Networks)) {
      const dynamicConfig = getEvmTokenConfig();
      const networkTokens = dynamicConfig[networkType as EvmNetworks];
      if (networkTokens && tokenStr in networkTokens) {
        return tokenStr;
      }
    }

    return EvmToken.USDC;
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
    ARS: EPaymentMethod.CBU,
    BRL: EPaymentMethod.PIX,
    EUR: EPaymentMethod.SEPA,
    USD: EPaymentMethod.SEPA // TODO
  };

  return destinationMap[fiatToken] || EPaymentMethod.SEPA;
};

interface QuoteParams {
  inputAmount?: Big;
  onChainToken: OnChainTokenSymbol;
  fiatToken: FiatToken;
  selectedNetwork: DestinationType;
  rampType: RampDirection;
}

interface QuotePayload {
  rampType: RampDirection;
  fromDestination: DestinationType;
  toDestination: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainTokenSymbol | FiatToken;
  outputCurrency: OnChainTokenSymbol | FiatToken;
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

export enum RampUrlParamsKeys {
  RAMP_TYPE = "rampType",
  NETWORK = "network",
  INPUT_AMOUNT = "inputAmount",
  PARTNER_ID = "partnerId",
  API_KEY = "apiKey",
  FIAT = "fiat",
  CRYPTO_LOCKED = "cryptoLocked",
  PAYMENT_METHOD = "paymentMethod",
  WALLET_LOCKED = "walletAddressLocked",
  CALLBACK_URL = "callbackUrl",
  EXTERNAL_SESSION_ID = "externalSessionId",
  COUNTRY_CODE = "countryCode",
  MONERIUM_CODE = "code",
  PROVIDED_QUOTE_ID = "quoteId"
}

export const useRampUrlParams = (): RampUrlParams => {
  const searchParams = useSearch({ strict: false }) as RampSearchParams;
  const { selectedNetwork } = useNetwork();
  const rampDirectionStore = useRampDirection();
  const evmTokensLoaded = useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot);

  const urlParams = useMemo(() => {
    const rampDirectionParam = searchParams.rampType?.toUpperCase();
    const fiatParam = searchParams.fiat?.toUpperCase();
    const cryptoLockedParam = searchParams.cryptoLocked?.toUpperCase();
    const countryCodeParam = searchParams.countryCode?.toUpperCase();

    const moneriumCode = searchParams.code?.toLowerCase();
    const networkParam = searchParams.network?.toLowerCase();
    const providedQuoteId = searchParams.quoteId?.toLowerCase();
    const paymentMethodParam = searchParams.paymentMethod?.toLowerCase() as PaymentMethod | undefined;

    // inputAmount may be string or number after TanStack Router deserialization
    const inputAmountParam = searchParams.inputAmount != null ? String(searchParams.inputAmount) : null;

    const partnerIdParam = searchParams.partnerId;
    const apiKeyParam = searchParams.apiKey;
    const walletLockedParam = searchParams.walletAddressLocked;
    const callbackUrlParam = searchParams.callbackUrl;
    const externalSessionIdParam = searchParams.externalSessionId;

    const rampDirection =
      rampDirectionParam === RampDirection.BUY || rampDirectionParam === RampDirection.SELL
        ? (rampDirectionParam as RampDirection)
        : rampDirectionStore || DEFAULT_RAMP_DIRECTION;

    const network = getNetworkFromParam(networkParam);
    const fiat = findFiatToken(fiatParam);
    const cryptoLocked = findOnChainToken(cryptoLockedParam, network || selectedNetwork);

    return {
      apiKey: apiKeyParam || undefined,
      callbackUrl: callbackUrlParam || undefined,
      countryCode: countryCodeParam || undefined,
      cryptoLocked,
      evmTokensLoaded,
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
    // evmTokensLoaded: triggers re-evaluation of cryptoLocked when dynamic tokens (e.g. WETH, WBTC) finish loading from SquidRouter
  }, [searchParams, rampDirectionStore, selectedNetwork, evmTokensLoaded]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const {
    rampDirection,
    inputAmount,
    apiKey,
    partnerId,
    providedQuoteId,
    network,
    fiat,
    cryptoLocked,
    countryCode,
    paymentMethod,
    walletLocked,
    callbackUrl,
    externalSessionId,
    moneriumCode
  } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();
  const setPartnerIdFn = useSetPartnerId();
  const setApiKeyFn = useSetApiKey();

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

  const isWidget = useWidgetMode();

  // biome-ignore lint/correctness/useExhaustiveDependencies: run-once guard via hasInitialized.current; re-running on every dep change would reset widget state
  useEffect(() => {
    // effect to read params when at /widget path
    if (!isWidget) return;
    if (hasInitialized.current) return;

    // Modify the ramp state machine accordingly
    if (providedQuoteId) {
      const quote = rampActor.getSnapshot()?.context.quote;

      if (externalSessionId) {
        rampActor.send({ externalSessionId, type: "SET_EXTERNAL_ID" });
      }

      if (quote?.id !== providedQuoteId) {
        rampActor.send({ apiKey, callbackUrl, partnerId, type: "SET_QUOTE_PARAMS", walletLocked });
        rampActor.send({ lock: true, quoteId: providedQuoteId, type: "SET_QUOTE" });
      }
    } else {
      // We set these parameters even if the quote fetch fails. Useful for error handling.
      rampActor.send({ apiKey, callbackUrl, partnerId, type: "SET_QUOTE_PARAMS", walletLocked });
      if (externalSessionId) {
        rampActor.send({ externalSessionId, type: "SET_EXTERNAL_ID" });
      }

      if (inputAmount && cryptoLocked && fiat && network && rampDirection) {
        const quoteParams = {
          fiatToken: fiat,
          inputAmount: new Big(inputAmount),
          onChainToken: cryptoLocked,
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
          apiKey,
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
            logger.current.error("Error fetching quote with provided parameters:", error);
            rampActor.send({ type: "INITIAL_QUOTE_FETCH_FAILED" });
          });
      }
    }

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    if (apiKey) {
      setApiKeyFn(apiKey);
    } else {
      setApiKeyFn(null);
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
  }, [isWidget]);

  useEffect(() => {
    // effect to read params when NOT in /widget path
    if (isWidget) return;

    if (hasInitialized.current) return;

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    if (apiKey) {
      setApiKeyFn(apiKey);
    } else {
      setApiKeyFn(null);
    }

    const persistState = moneriumCode !== undefined;

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
    isWidget,
    apiKey,
    cryptoLocked,
    fiat,
    inputAmount,
    partnerId,
    rampDirection,
    resetRampForm,
    setInputAmount,
    setOnChainToken,
    setApiKeyFn,
    setPartnerIdFn,
    onToggle,
    handleFiatToken,
    moneriumCode
  ]);

  useEffect(() => {
    if (cryptoLocked) {
      setOnChainToken(cryptoLocked);
    }
  }, [cryptoLocked, setOnChainToken]);
};
