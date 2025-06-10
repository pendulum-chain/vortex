import { RampDirection } from '../../components/RampToggle';
import { Language, getLanguageFromPath } from '../../translations/helpers';

const DEFAULT_RAMP_DIRECTION = RampDirection.ONRAMP;

const getRampDirectionFromPath = (): RampDirection => {
  if (typeof window === 'undefined') {
    return DEFAULT_RAMP_DIRECTION;
  }

  const params = new URLSearchParams(window.location.search);
  const rampParam = params.get('ramp')?.toLowerCase();

  const rampDirection =
    rampParam === 'buy'
      ? RampDirection.ONRAMP
      : getLanguageFromPath() === Language.Portuguese_Brazil
        ? RampDirection.ONRAMP
        : RampDirection.OFFRAMP;

  return rampDirection;
};

export { getRampDirectionFromPath, DEFAULT_RAMP_DIRECTION };
