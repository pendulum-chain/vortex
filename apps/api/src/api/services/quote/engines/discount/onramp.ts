import { RampDirection } from "@vortexfi/shared";
import { BaseDiscountEngine } from ".";

export class OnRampDiscountEngine extends BaseDiscountEngine {
  readonly config = {
    direction: RampDirection.BUY,
    isOfframp: false,
    missingContextMessage: "OnRampDiscountEngine requires nablaSwap in context",
    skipNote: "Skipped for off-ramp request"
  } as const;
}
