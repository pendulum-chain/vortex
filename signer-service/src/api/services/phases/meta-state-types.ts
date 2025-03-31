import { PendulumDetails, RampCurrency, StellarTokenDetails } from "shared";


export interface StateMetadata  {
    nablaSoftMinimumOutputRaw: string;
    pendulumEphemeralAddress: string;
    inputTokenPendulumDetails: PendulumDetails;
    outputTokenPendulumDetails: PendulumDetails;
    outputTokenType: RampCurrency;
    outputAmountBeforeFees: { units: string; raw: string };
    // Only used in offramp - eurc route
    stellarTarget: {stellarTargetAccountId: string, stellarTokenDetails: StellarTokenDetails};
    executeSpacewalkNonce: number;
}