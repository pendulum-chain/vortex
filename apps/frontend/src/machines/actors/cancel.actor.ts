import { RampService } from "../../services/api";
import { RampContext } from "../types";

export const cancelRampActor = async ({ input }: { input: RampContext }): Promise<void> => {
  const rampId = input.rampState?.ramp?.id;
  if (!rampId) {
    throw new Error("Ramp state is missing, cannot cancel ramp.");
  }

  await RampService.cancelRamp(rampId);
};
