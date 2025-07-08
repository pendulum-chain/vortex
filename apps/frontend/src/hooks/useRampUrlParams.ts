import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken } from "@packages/shared";
import { useEffect, useMemo, useRef } from "react";
import { RampDirection } from "../components/RampToggle";
import { getFirstEnabledFiatToken, isFiatTokenEnabled } from "../config/tokenAvailability";
import { useNetwork } from "../contexts/network";
import { DEFAULT_RAMP_DIRECTION } from "../helpers/path";
import { useSetPartnerId } from "../stores/partnerStore";
import { defaultFiatTokenAmounts, useRampFormStoreActions } from "../stores/ramp/useRampFormStore";
import { useRampDirection, useRampDirectionToggle } from "../stores/rampDirectionStore";

interface RampUrlParams {
  ramp: RampDirection;
  network?: Networks;
  to?: string;
  from?: string;
  fromAmount?: string;
  partnerId?: string;
  moneriumCode?: string;
}

function findFiatToken(fiatToken?: string, rampDirection?: RampDirection): FiatToken | undefined {
  if (!fiatToken) {
    return undefined;
  }

  const fiatTokenEntries = Object.entries(FiatToken);
  const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toLowerCase() === fiatToken);

  if (!matchedFiatToken) {
    return undefined;
  }

  const [_, tokenValue] = matchedFiatToken;
  const foundToken = tokenValue as FiatToken;

  if (rampDirection === RampDirection.ONRAMP && foundToken !== FiatToken.BRL) {
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
    const matchedToken = assetHubTokenEntries.find(([_, token]) => token.toLowerCase() === tokenStr);

    if (!matchedToken) {
      return AssetHubToken.USDC;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as unknown as OnChainToken;
  } else {
    const evmTokenEntries = Object.entries(EvmToken);
    const matchedToken = evmTokenEntries.find(([_, token]) => token.toLowerCase() === tokenStr);

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
    const toTokenParam = params.get("to")?.toLowerCase();
    const fromTokenParam = params.get("from")?.toLowerCase();
    const inputAmountParam = params.get("fromAmount");
    const partnerIdParam = params.get("partnerId");
    const moneriumCode = params.get("code")?.toLowerCase();

    const ramp =
      rampParam === undefined
        ? rampDirection
        : rampParam === "sell"
          ? RampDirection.OFFRAMP
          : rampParam === "buy"
            ? RampDirection.ONRAMP
            : DEFAULT_RAMP_DIRECTION;

    const from =
      ramp === RampDirection.OFFRAMP
        ? findOnChainToken(fromTokenParam, networkParam || selectedNetwork)
        : findFiatToken(fromTokenParam, ramp);
    const to =
      ramp === RampDirection.OFFRAMP
        ? findFiatToken(toTokenParam, ramp)
        : findOnChainToken(toTokenParam, networkParam || selectedNetwork);

    const fromAmount =
      ramp === RampDirection.OFFRAMP ? defaultFiatTokenAmounts[to as FiatToken] : defaultFiatTokenAmounts[from as FiatToken];

    return {
      from,
      fromAmount: inputAmountParam || fromAmount || undefined,
      moneriumCode,
      network: getNetworkFromParam(networkParam),
      partnerId: partnerIdParam || undefined,
      ramp,
      to
    };
  }, [params, rampDirection, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const { ramp, to, from, fromAmount, partnerId, moneriumCode } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();
  const setPartnerIdFn = useSetPartnerId();

  const { setFiatToken, setOnChainToken, setInputAmount } = useRampFormStoreActions();

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
    if (hasInitialized.current) return;
    console.log("moneriumCode", moneriumCode);
    if (moneriumCode) return;

    onToggle(ramp);

    if (to) {
      if (ramp === RampDirection.OFFRAMP) {
        handleFiatToken(to as FiatToken);
      } else {
        setOnChainToken(to as OnChainToken);
      }
    }

    if (from) {
      if (ramp === RampDirection.OFFRAMP) {
        setOnChainToken(from as OnChainToken);
      } else {
        handleFiatToken(from as FiatToken);
      }
    }

    if (fromAmount) {
      setInputAmount(fromAmount);
    }

    if (partnerId) {
      setPartnerIdFn(partnerId);
    } else {
      setPartnerIdFn(null);
    }

    hasInitialized.current = true;
  }, []); // Empty dependency array means run once on mount
};
