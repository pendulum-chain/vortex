import { ExtrinsicOptions, IbanPaymentData, PendulumTokenDetails, RampCurrency, StellarTokenDetails } from "@packages/shared";

export interface StateMetadata {
  inputAmount: string;
  outputAmount: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  nablaSoftMinimumOutputRaw: string;
  pendulumEphemeralAddress: string;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenType: RampCurrency;
  inputAmountBeforeSwapRaw: string;
  // The final step for onramp is the squidRouterSwap or XCM transfer, for offramps it's the anchor payout
  outputAmountBeforeFinalStep: { units: string; raw: string };
  // Only used in offramp
  squidRouterReceiverId: string;
  moonbeamXcmTransactionHash: string;
  squidRouterReceiverHash: string;
  // Only used in offramp - eurc & ars route
  stellarEphemeralAccountId: string;
  stellarTarget: {
    stellarTargetAccountId: string;
    stellarTokenDetails: StellarTokenDetails;
  };
  executeSpacewalkNonce: number;
  // Only used in onramp - brla
  inputAmountUnits: string;
  inputAmountBeforeSwapUnits: string;
  taxId: string;
  pixDestination: string;
  brlaEvmAddress: string;
  walletAddress: string | undefined;
  destinationAddress: string;
  receiverTaxId: string;
  moonbeamEphemeralAddress: string;
  moonbeamEphemeralAccount: { secret: string; address: string };
  finalUserAddress: string;
  pendulumToAssethubXcmHash?: string;
  nabla: {
    approveExtrinsicOptions: ExtrinsicOptions;
    swapExtrinsicOptions: ExtrinsicOptions;
  };
  assetHubToPendulumHash: string;
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  squidRouterPayTxHash: string;
  unhandledPaymentAlertSent: boolean;
  pendulumToMoonbeamXcmHash?: string;
  depositQrCode: string | undefined;
  payOutTicketId: string | undefined;
  // Only used in onramp, offramp - monerium
  polygonEphemeralAddress: string;
  ibanPaymentData: IbanPaymentData;
  squidRouterQuoteId: string;
}
