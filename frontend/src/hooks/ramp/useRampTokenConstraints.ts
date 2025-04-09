import { useEffect } from 'react';
import { FiatToken } from 'shared';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useRampFormStoreActions, useFiatToken } from '../../stores/ramp/useRampFormStore';
import { RampDirection } from '../../components/RampToggle';

/**
 * Hook to enforce BRLA token constraint in onramp mode
 */
export const useRampTokenConstraints = () => {
  const direction = useRampDirection();
  const currentFiatToken = useFiatToken();
  const { setFiatToken } = useRampFormStoreActions();

  useEffect(() => {
    console.log('currentFiatToken', currentFiatToken, direction);
    if (direction === RampDirection.ONRAMP && currentFiatToken !== FiatToken.BRL) {
      setFiatToken(FiatToken.BRL);
    }
  }, [direction, currentFiatToken, setFiatToken]);
};
