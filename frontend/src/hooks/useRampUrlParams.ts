import { useEffect, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { AssetHubToken, EvmToken, FiatToken, Networks } from 'shared';
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

export const useRampUrlParams = ({ form }: UseRampUrlParamsProps) => {
  const toggleDirection = useRampDirectionToggle();
  const { setFiatToken, setOnChainToken } = useRampFormStoreActions();
  const { selectedNetwork } = useNetwork();
  const params = useUrlSearchParams();
  const rampDirection = useRampDirection();

  // Handle ramp direction parameter
  useEffect(() => {
    const rampParam = params.get('ramp')?.toLowerCase();

    if (rampParam === 'buy') {
      toggleDirection(RampDirection.ONRAMP);
    } else if (rampParam === 'sell') {
      toggleDirection(RampDirection.OFFRAMP);
    }
  }, [params, toggleDirection]);

  // Handle token parameters based on ramp direction
  useEffect(() => {
    const fromParam = params.get('from')?.toLowerCase();
    const toParam = params.get('to')?.toLowerCase();
    const networkParam = params.get('network')?.toLowerCase();
    const isOnramp = rampDirection === RampDirection.ONRAMP;

    // Handle 'from' parameter
    if (fromParam) {
      if (isOnramp) {
        // For ONRAMP: 'from' is a FiatToken
        const fiatTokenEntries = Object.entries(FiatToken);
        const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toLowerCase() === fromParam);

        if (matchedFiatToken) {
          const [_, tokenValue] = matchedFiatToken;
          setFiatToken(tokenValue as FiatToken);
          form.setValue('fiatToken', tokenValue as FiatToken);
        }
      } else {
        // For OFFRAMP: 'from' is an OnChainToken
        if (networkParam === Networks.AssetHub || selectedNetwork === Networks.AssetHub) {
          const assetHubTokenEntries = Object.entries(AssetHubToken);
          const matchedAssetHubToken = assetHubTokenEntries.find(([_, token]) => token.toLowerCase() === fromParam);

          if (matchedAssetHubToken) {
            const [_, tokenValue] = matchedAssetHubToken;
            setOnChainToken(tokenValue);
            form.setValue('onChainToken', tokenValue);
          }
        } else {
          const evmTokenEntries = Object.entries(EvmToken);
          const matchedEvmToken = evmTokenEntries.find(([_, token]) => token.toLowerCase() === fromParam);

          if (matchedEvmToken) {
            const [_, tokenValue] = matchedEvmToken;
            setOnChainToken(tokenValue as EvmToken);
            form.setValue('onChainToken', tokenValue as EvmToken);
          }
        }
      }
    }

    // Handle 'to' parameter
    if (toParam) {
      if (isOnramp) {
        // For ONRAMP: 'to' is an OnChainToken
        if (networkParam === Networks.AssetHub || selectedNetwork === Networks.AssetHub) {
          const assetHubTokenEntries = Object.entries(AssetHubToken);
          const matchedAssetHubToken = assetHubTokenEntries.find(([_, token]) => token.toLowerCase() === toParam);

          if (matchedAssetHubToken) {
            const [_, tokenValue] = matchedAssetHubToken;
            setOnChainToken(tokenValue);
            form.setValue('onChainToken', tokenValue);
          }
        } else {
          const evmTokenEntries = Object.entries(EvmToken);
          const matchedEvmToken = evmTokenEntries.find(([_, token]) => token.toLowerCase() === toParam);

          if (matchedEvmToken) {
            const [_, tokenValue] = matchedEvmToken;
            setOnChainToken(tokenValue as EvmToken);
            form.setValue('onChainToken', tokenValue as EvmToken);
          }
        }
      } else {
        // For OFFRAMP: 'to' is a FiatToken
        const fiatTokenEntries = Object.entries(FiatToken);
        const matchedFiatToken = fiatTokenEntries.find(([_, token]) => token.toLowerCase() === toParam);

        if (matchedFiatToken) {
          const [_, tokenValue] = matchedFiatToken;
          setFiatToken(tokenValue as FiatToken);
          form.setValue('fiatToken', tokenValue as FiatToken);
        }
      }
    }
  }, [params, form, setFiatToken, setOnChainToken, selectedNetwork, rampDirection]);

  // Handle input amount parameter
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
