import { RampProcess } from "@packages/shared";
import { fromPromise } from "xstate";
import { RampService } from "../../services/api";
import { RampContext, RampState } from "../types";

export const startRampActor = async ({ input }: { input: RampContext }): Promise<RampProcess> => {
  const { rampState } = input;

  if (!rampState || !rampState.ramp) {
    throw new Error("Ramp state or ramp process not found.");
  }

  const response = await RampService.startRamp(rampState.ramp.id);
  console.log("Error during starting ramp: ", response);
  return response;
};
