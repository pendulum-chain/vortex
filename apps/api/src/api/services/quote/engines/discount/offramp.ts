import { RampDirection } from "@vortexfi/shared";
import { BaseDiscountEngine } from ".";

export class OffRampDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.SELL,
    isOfframp: true,
    missingContextMessage: "OffRampDiscountEngine requires nablaSwap in context",
    skipNote: "Skipped for on-ramp request"
  } as const;
}
