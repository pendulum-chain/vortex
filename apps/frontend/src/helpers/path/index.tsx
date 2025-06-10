import { RampDirection } from '../../components/RampToggle';

const DEFAULT_RAMP_DIRECTION = RampDirection.ONRAMP;

const getRampDirectionFromPath = (): RampDirection => {
  if (typeof window === 'undefined') {
    return DEFAULT_RAMP_DIRECTION;
  }

  const params = new URLSearchParams(window.location.search);
  const rampParam = params.get('ramp')?.toLowerCase();

  const rampDirection = rampParam === 'sell' ? RampDirection.OFFRAMP : RampDirection.ONRAMP;

  return rampDirection;
};

export { getRampDirectionFromPath, DEFAULT_RAMP_DIRECTION };
