import { useEffect, useMemo, useRef } from 'react';
import { RampDirection } from '../components/RampToggle';
import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken } from 'shared';
import { useRampDirection, useRampDirectionToggle } from '../stores/rampDirectionStore';
import { useRampFormStoreActions } from '../stores/ramp/useRampFormStore';
import { useNetwork } from '../contexts/network';

interface RampUrlParams {
  ramp: RampDirection;
  network?: Networks;
  to?: string;
  from?: string;
  fromAmount?: string;
}

const defaultFiatTokenAmounts: Record<FiatToken, string> = { eurc: '20', ars: '20', brl: '5' };

function findFiatToken(fiatToken?: string): FiatToken | undefined {
  if (!fiatToken) {
    return undefined;
  }

  const fiatTokenEntries = Object.entries(FiatToken);
  const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toLowerCase() === fiatToken);

  if (!matchedFiatToken) {
    return undefined;
  }

  const [_, tokenValue] = matchedFiatToken;

  return tokenValue as FiatToken;
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
      return undefined;
    }

    const [_, tokenValue] = matchedToken;
    return tokenValue as unknown as OnChainToken;
  } else {
    const evmTokenEntries = Object.entries(EvmToken);
    const matchedToken = evmTokenEntries.find(([_, token]) => token.toLowerCase() === tokenStr);

    if (!matchedToken) {
      return undefined;
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

    const ramp =
      rampParam === undefined ? rampDirection : rampParam === 'buy' ? RampDirection.ONRAMP : RampDirection.OFFRAMP;

    const from =
      ramp === RampDirection.OFFRAMP
        ? findOnChainToken(fromTokenParam, networkParam || selectedNetwork)
        : findFiatToken(fromTokenParam);
    const to =
      ramp === RampDirection.OFFRAMP
        ? findFiatToken(toTokenParam)
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
    };
  }, [params, rampDirection, selectedNetwork]);

  return urlParams;
};

export const useSetRampUrlParams = () => {
  const { ramp, to, from, fromAmount } = useRampUrlParams();

  const onToggle = useRampDirectionToggle();

  const { setFiatToken, setOnChainToken, setInputAmount } = useRampFormStoreActions();

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;

    onToggle(ramp);

    if (to) {
      ramp === RampDirection.OFFRAMP ? setFiatToken(to as FiatToken) : setOnChainToken(to as OnChainToken);
    }

    if (from) {
      ramp === RampDirection.OFFRAMP ? setOnChainToken(from as OnChainToken) : setFiatToken(from as FiatToken);
    }

    if (fromAmount) {
      setInputAmount(fromAmount);
    }

    hasInitialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means run once on mount
};
