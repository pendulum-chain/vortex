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
    if (direction === RampDirection.ONRAMP && currentFiatToken !== 'brl') {
      setFiatToken('brl' as FiatToken);
    }
  }, [direction, currentFiatToken, setFiatToken]);
};
