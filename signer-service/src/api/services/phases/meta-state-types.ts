import { PendulumDetails, StellarTokenDetails } from "shared";


export interface StateMetadata  {
    nablaSoftMinimumOutputRaw: string;
    pendulumEphemeralAddress: string;
    inputTokenPendulumDetails: PendulumDetails;
    outputTokenPendulumDetails: PendulumDetails;
    outputAmountBeforeFees: { units: string; raw: string };
    stellarTarget: {stellarTargetAccountId: string, stellarTokenDetails: StellarTokenDetails};
    executeSpacewalkNonce: number;
}