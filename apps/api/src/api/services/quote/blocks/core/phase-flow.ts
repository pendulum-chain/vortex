import type { RampPhase } from "@vortexfi/shared";
import type { Flow } from "./types";

export function assemblePhaseFlow(flow: Flow): RampPhase[] {
  return ["initial", ...flow.phases, "complete"];
}
