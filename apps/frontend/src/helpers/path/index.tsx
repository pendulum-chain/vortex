import { RampDirection } from "@packages/shared";
import { getLanguageFromPath, Language } from "../../translations/helpers";

const DEFAULT_RAMP_DIRECTION = RampDirection.BUY;

const getRampDirectionFromPath = (): RampDirection => {
  if (typeof window === "undefined") {
    return DEFAULT_RAMP_DIRECTION;
  }

  const params = new URLSearchParams(window.location.search);
  const rampParam = params.get("ramp")?.toUpperCase();

  const normalizedRampParam = rampParam?.toUpperCase();

  if (normalizedRampParam === RampDirection.SELL || normalizedRampParam === RampDirection.BUY) {
    return normalizedRampParam;
  }

  // If the language is Portuguese, we default to BUY, otherwise we default to SELL
  const isLanguagePortuguese = getLanguageFromPath()?.toUpperCase() === Language.Portuguese_Brazil.toUpperCase();
  return isLanguagePortuguese ? RampDirection.BUY : RampDirection.SELL;
};

export { getRampDirectionFromPath, DEFAULT_RAMP_DIRECTION };
