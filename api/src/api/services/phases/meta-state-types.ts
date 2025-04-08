import { PendulumDetails, RampCurrency, StellarTokenDetails } from 'shared';

export interface StateMetadata {
  nablaSoftMinimumOutputRaw: string;
  pendulumEphemeralAddress: string;
  inputTokenPendulumDetails: PendulumDetails;
  outputTokenPendulumDetails: PendulumDetails;
  outputTokenType: RampCurrency;
  inputAmountBeforeSwapRaw: string;
  outputAmountBeforeFees: { units: string; raw: string };
  // Only used in offramp
  squidRouterReceiverId: string;
  moonbeamXcmTransactionHash: string;
  squidRouterReceiverHash: string;
  // Only used in offramp - eurc & ars route
  stellarEphemeralAccountId: string;
  stellarTarget: { stellarTargetAccountId: string; stellarTokenDetails: StellarTokenDetails };
  executeSpacewalkNonce: number;
  // Only used in onramp - brla
  inputAmountUnits: string;
  inputAmountBeforeSwapUnits: string;
  taxId: string;
  pixDestination: string;
  brlaEvmAddress: string;
  destinationAddress: string;
  receiverTaxId: string;
  moonbeamEphemeralAddress: string;
}
