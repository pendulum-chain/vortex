import { fromPromise } from "xstate";
import { RampService } from "../../services/api";
import { RampContext } from "../types";

export const startRampActor = fromPromise(async ({ input }: { input: RampContext }) => {
  const { rampState, rampPaymentConfirmed } = input;

  if (!rampState || !rampState.ramp) {
    throw new Error("Ramp state or ramp process not found.");
  }

  // Check if user confirmed that they made the payment for on-ramps
  if (rampState.ramp.type === "on" && !rampPaymentConfirmed) {
    throw new Error("Payment not confirmed for on-ramp.");
  }

  const response = await RampService.startRamp(rampState.ramp.id);

  return response;
});
