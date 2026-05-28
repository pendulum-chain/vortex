import { RampDirection } from "@vortexfi/shared";

const DEFAULT_RAMP_DIRECTION = RampDirection.BUY;

const getRampDirectionFromPath = (): RampDirection => {
  if (typeof window === "undefined") {
    return DEFAULT_RAMP_DIRECTION;
  }

  const params = new URLSearchParams(window.location.search);
  const rampParam = params.get("rampType")?.toUpperCase();

  const normalizedRampParam = rampParam?.toUpperCase();

  if (normalizedRampParam === RampDirection.SELL || normalizedRampParam === RampDirection.BUY) {
    return normalizedRampParam;
  }

  return DEFAULT_RAMP_DIRECTION;
};

export { getRampDirectionFromPath, DEFAULT_RAMP_DIRECTION };
