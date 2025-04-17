import { useEffect, useMemo, useCallback } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { AssetHubToken, EvmToken, FiatToken, Networks, OnChainToken } from 'shared';
import { RampFormValues } from './ramp/schema';
import { useRampDirectionToggle } from '../stores/rampDirectionStore';
import { RampDirection } from '../components/RampToggle';
import { useRampFormStoreActions } from '../stores/ramp/useRampFormStore';
import { useNetwork } from '../contexts/network';
import { useRampDirection } from '../stores/rampDirectionStore';

interface UseRampUrlParamsProps {
  form: UseFormReturn<RampFormValues, unknown, undefined>;
}

const defaultFiatTokenAmounts: Record<FiatToken, number> = { eurc: 20, ars: 20, brl: 5 };

const useUrlSearchParams = () => {
  return useMemo(() => new URLSearchParams(window.location.search), []);
};

const findFiatToken = (fiatToken: string): FiatToken | undefined => {
  const fiatTokenEntries = Object.entries(FiatToken);
  const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toLowerCase() === fiatToken);

  if (!matchedFiatToken) {
    return undefined;
  }

  const [_, tokenValue] = matchedFiatToken;

  return tokenValue as FiatToken;
};

const findOnChainToken = (tokenStr: string, networkType: Networks | string): OnChainToken | undefined => {
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
};

export const useRampUrlParams = ({ form }: UseRampUrlParamsProps) => {
  const toggleDirection = useRampDirectionToggle();
  const { setFiatToken, setOnChainToken } = useRampFormStoreActions();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();
  const params = useUrlSearchParams();

  useEffect(() => {
    const rampParam = params.get('ramp')?.toLowerCase();

    if (rampParam === 'buy') {
      toggleDirection(RampDirection.ONRAMP);
    } else {
      toggleDirection(RampDirection.OFFRAMP);
    }
  }, [params, toggleDirection]);

  const setFiatTokenFromUrl = useCallback(
    (fiatToken: string) => {
      const tokenValue = findFiatToken(fiatToken);

      if (tokenValue) {
        setFiatToken(tokenValue);
        form.setValue('fiatToken', tokenValue);
      }
    },
    [form, setFiatToken],
  );

  const setOnChainTokenFromUrl = useCallback(
    (tokenStr: string, networkType: Networks | string) => {
      const tokenValue = findOnChainToken(tokenStr, networkType);

      if (tokenValue) {
        setOnChainToken(tokenValue);
        form.setValue('onChainToken', tokenValue);
      }
    },
    [form, setOnChainToken],
  );

  useEffect(() => {
    const toTokenParam = params.get('to')?.toLowerCase();
    const rampParam = params.get('ramp')?.toLowerCase() || rampDirection;
    const networkParam = params.get('network')?.toLowerCase() || selectedNetwork;

    if (!toTokenParam) return;

    if (rampParam === 'buy') {
      setOnChainTokenFromUrl(toTokenParam, networkParam);
    } else {
      setFiatTokenFromUrl(toTokenParam);
    }
  }, [params, rampDirection, selectedNetwork, setFiatTokenFromUrl, setOnChainTokenFromUrl]);

  useEffect(() => {
    const fromTokenParam = params.get('from')?.toLowerCase();
    const rampParam = params.get('ramp')?.toLowerCase() || rampDirection;
    const networkParam = params.get('network')?.toLowerCase() || selectedNetwork;

    if (!fromTokenParam) return;

    if (rampParam === 'buy') {
      setFiatTokenFromUrl(fromTokenParam);
    } else {
      setOnChainTokenFromUrl(fromTokenParam, networkParam);
    }
  }, [params, rampDirection, selectedNetwork, setFiatTokenFromUrl, setOnChainTokenFromUrl]);

  useEffect(() => {
    const inputAmountParam = params.get('fromAmount');
    const fiatToken = form.getValues('fiatToken');

    if (inputAmountParam) {
      const parsedAmount = Number(inputAmountParam);
      if (Number.isFinite(parsedAmount) && !isNaN(parsedAmount) && parsedAmount >= 0) {
        form.setValue('inputAmount', parsedAmount.toFixed(2));
      }
    } else if (fiatToken) {
      const defaultAmount = defaultFiatTokenAmounts[fiatToken as FiatToken];
      form.setValue('inputAmount', defaultAmount.toFixed(2));
    }
  }, [params, form]);
};
