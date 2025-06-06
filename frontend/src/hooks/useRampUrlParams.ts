import { useEffect, useMemo, useRef } from 'react';
import { RampDirection } from '../components/RampToggle';
import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken } from 'shared';
import { useRampDirection, useRampDirectionToggle } from '../stores/rampDirectionStore';
import {
  DEFAULT_ARS_AMOUNT,
  DEFAULT_ASSETHUB_ONCHAIN_TOKEN,
  DEFAULT_BRL_AMOUNT,
  DEFAULT_EURC_AMOUNT,
  useRampFormStoreActions,
} from '../stores/ramp/useRampFormStore';
import { useNetwork } from '../contexts/network';
import { useSetPartnerId } from '../stores/partnerStore';
import { isFiatTokenEnabled, getFirstEnabledFiatToken } from '../config/tokenAvailability';
import { DEFAULT_RAMP_DIRECTION } from '../helpers/path';

interface RampUrlParams {
  ramp: RampDirection;
  network?: Networks;
  to?: string;
  from?: string;
  fromAmount?: string;
  partnerId?: string;
}

const defaultFiatTokenAmounts: Record<FiatToken, string> = {
  eur: DEFAULT_EURC_AMOUNT,
  ars: DEFAULT_ARS_AMOUNT,
  brl: DEFAULT_BRL_AMOUNT,
};

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
      return DEFAULT_ASSETHUB_ONCHAIN_TOKEN;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as unknown as OnChainToken;
  } else {
    const evmTokenEntries = Object.entries(EvmToken);
    const matchedToken = evmTokenEntries.find(([_, token]) => token.toLowerCase() === tokenStr);

    if (!matchedToken) {
      return DEFAULT_EVM_ONCHAIN_TOKEN;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as OnChainToken;
  }
}

function getNetworkFromParam(param?: string): Networks | undefined {
  if (param) {
    const matchedNetwork = Object.values(Networks).find((network) => network.toLowerCase() === param);
    return matchedNetwork;
  }
  return undefined;
}

export const useRampUrlParams = (): RampUrlParams => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();

  const urlParams = useMemo(() => {
    const rampParam = params.get('ramp')?.toLowerCase();
    const networkParam = params.get('network')?.toLowerCase();
    const toTokenParam = params.get('to')?.toLowerCase();
    const fromTokenParam = params.get('from')?.toLowerCase();
    const inputAmountParam = params.get('fromAmount');
    const partnerIdParam = params.get('partnerId');

    const ramp =
      rampParam === undefined
        ? rampDirection
        : rampParam === 'sell'
        ? RampDirection.OFFRAMP
        : rampParam === 'buy'
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
      ramp === RampDirection.OFFRAMP
        ? defaultFiatTokenAmounts[to as FiatToken]
        : defaultFiatTokenAmounts[from as FiatToken];

    return {
      ramp,
      network: getNetworkFromParam(networkParam),
      from,
      to,
      fromAmount: inputAmountParam || fromAmount || undefined,
      partnerId: partnerIdParam || undefined,
    };
  }, [params, rampDirection, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const { ramp, to, from, fromAmount, partnerId } = useRampUrlParams();

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

  useEffect(() => {
    if (hasInitialized.current) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means run once on mount
};
