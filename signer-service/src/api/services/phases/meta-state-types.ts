import { PendulumDetails } from "shared";


export interface StateMetadata  {
    nablaSoftMinimumOutputRaw: string;
    pendulumEphemeralAddress: string;
    pendulumAmountRaw: string;
    inputTokenPendulumDetails: PendulumDetails;
    outputTokenPendulumDetails: PendulumDetails;
}